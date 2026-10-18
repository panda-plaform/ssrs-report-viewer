using System.Text;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Builds a browser-ready CreateFixedHeaders runtime from proxied ReportViewer ViewerScript
/// (Microsoft_ReportingServices_HTMLRenderer_FixedHeader) plus Html5Renderer helpers.
/// </summary>
public static class FixedHeaderRuntimeBuilder
{
    public static string Build(string viewerScript, string html5RendererJs)
    {
        var helpers = ExtractFunctions(
            viewerScript,
            "Microsoft_ReportingServices_HTMLRenderer_IsStandardsMode",
            "Microsoft_ReportingServices_HTMLRenderer_IsIE",
            "Microsoft_ReportingServices_HTMLRenderer_IsIE8OrLater",
            "Microsoft_ReportingServices_HTMLRenderer_GetMaxChildRowSpan");

        var fixedHeader = ExtractAssignment(
            viewerScript,
            "Microsoft_ReportingServices_HTMLRenderer_FixedHeader=function");

        var resize = ExtractFunctions(html5RendererJs, "ResizeVerticalTextBoxes");

        var sb = new StringBuilder(viewerScript.Length / 4);
        sb.AppendLine("/* Proxied ReportViewer FixedHeader runtime (CreateFixedHeaders). */");
        sb.AppendLine(helpers);
        sb.AppendLine(resize);
        sb.AppendLine("var Microsoft_ReportingServices_HTMLRenderer_FixedHeader=" + fixedHeader + ";");
        sb.AppendLine(CreateFixedHeadersGlue);
        return sb.ToString();
    }

    private static string ExtractFunctions(string source, params string[] names)
    {
        var sb = new StringBuilder();
        foreach (var name in names)
        {
            var marker = "function " + name;
            var start = source.IndexOf(marker, StringComparison.Ordinal);
            if (start < 0)
            {
                throw new InvalidOperationException($"Could not extract function '{name}' from ReportViewer script.");
            }

            var brace = source.IndexOf('{', start);
            var depth = 0;
            var end = brace;
            for (; end < source.Length; end++)
            {
                if (source[end] == '{')
                {
                    depth++;
                }
                else if (source[end] == '}')
                {
                    depth--;
                    if (depth == 0)
                    {
                        break;
                    }
                }
            }

            sb.Append(source[start..(end + 1)]).Append(';').AppendLine();
        }

        return sb.ToString();
    }

    private static string ExtractAssignment(string source, string marker)
    {
        var start = source.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0)
        {
            throw new InvalidOperationException($"Could not find '{marker}' in ViewerScript.");
        }

        var assign = source.IndexOf("=function", start, StringComparison.Ordinal);
        if (assign < 0)
        {
            throw new InvalidOperationException("FixedHeader assignment malformed.");
        }

        // Capture from `function(...){...}` through the prototype object literal ending `};`
        var fnStart = assign + 1; // at 'function'
        var brace = source.IndexOf('{', fnStart);
        var depth = 0;
        var i = brace;
        for (; i < source.Length; i++)
        {
            if (source[i] == '{')
            {
                depth++;
            }
            else if (source[i] == '}')
            {
                depth--;
                if (depth == 0)
                {
                    break;
                }
            }
        }

        // After constructor function, prototype assignment continues: `.prototype={...};`
        var afterCtor = i + 1;
        var proto = source.IndexOf(".prototype=", afterCtor, StringComparison.Ordinal);
        if (proto < 0 || proto > afterCtor + 80)
        {
            return source[fnStart..(i + 1)];
        }

        var protoBrace = source.IndexOf('{', proto);
        depth = 0;
        for (i = protoBrace; i < source.Length; i++)
        {
            if (source[i] == '{')
            {
                depth++;
            }
            else if (source[i] == '}')
            {
                depth--;
                if (depth == 0)
                {
                    // include trailing `}` and optional `;`
                    var end = i + 1;
                    if (end < source.Length && source[end] == ';')
                    {
                        end++;
                    }

                    // Return `function(...){...}.prototype={...};` as expression for `var X = <expr>`
                    return source[fnStart..end].TrimEnd(';');
                }
            }
        }

        throw new InvalidOperationException("Could not extract FixedHeader prototype.");
    }

    /// <summary>
    /// Glue: CreateFixedHeaders using native ReportViewer FixedHeader overlay markup
    /// (<c>fcgh0_</c> / <c>frgh0_</c> / <c>fch0_</c> clones under #oReportCell), matching
    /// HTML5 ReportViewer scrolling. Sticky is only a last-resort fallback.
    /// </summary>
    private const string CreateFixedHeadersGlue =
        """
        (function (global) {
          function contentRows(table) {
            return Array.prototype.filter.call(table.rows || [], function (row) {
              return row.getAttribute("aria-hidden") !== "true" && row.getAttribute("HEIGHT") !== "0";
            });
          }

          function allRows(table) {
            return Array.prototype.slice.call(table.rows || []);
          }

          function forEachColumnCell(row, fn) {
            var cells = row.cells || [];
            var col = 0;
            for (var i = 0; i < cells.length; i++) {
              var cell = cells[i];
              var span = cell.colSpan > 0 ? cell.colSpan : 1;
              fn(cell, col, col + span - 1, span);
              col += span;
            }
          }

          function ensureCellId(cell, tableId, rowIndex, colStart) {
            if (!cell.id) {
              cell.id = tableId + "_fc" + rowIndex + "_" + colStart;
            }
            return cell.id;
          }

          function collectFixedCellIds(row, tableId, rowIndex, fixedCols, into) {
            var lastId = null;
            var firstId = null;
            forEachColumnCell(row, function (cell, start, end) {
              if (start >= fixedCols) {
                return;
              }
              var id = ensureCellId(cell, tableId, rowIndex, start);
              into.push(id);
              if (!firstId) {
                firstId = id;
              }
              lastId = id;
            });
            return { firstId: firstId, lastId: lastId };
          }

          function removeOverlay(id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          }

          function wireMicrosoftFixedHeader(table, reportDiv, reportCell, fixedRows, fixedCols) {
            if (typeof Microsoft_ReportingServices_HTMLRenderer_FixedHeader !== "function") {
              return false;
            }
            var tableId = table.id;
            if (!tableId) {
              return false;
            }
            var rows = contentRows(table);
            if (fixedRows <= 0 || rows.length === 0) {
              return false;
            }
            for (var need = 0; need < fixedRows; need++) {
              if (!rows[need] || !rows[need].id) {
                return false;
              }
            }

            // Native HTML5 ReportViewer: transform on oReportCell is the containing block
            // for absolute fcgh0/frgh0/fch0 overlays.
            if (!reportCell.style.transform) {
              reportCell.style.transform = "scale(1)";
              reportCell.style.transformOrigin = "0 0";
            }

            var fh = new Microsoft_ReportingServices_HTMLRenderer_FixedHeader(
              reportDiv.id || "oReportDiv",
              reportCell.id || "oReportCell",
              reportDiv.id || "oReportDiv",
              "");

            // Native overlay ids: {prefix}fcgh0_{tableId}, frgh0_, fch0_
            var colOverlayId = "fcgh0_" + tableId;
            var rowOverlayId = fixedCols > 0 ? "frgh0_" + tableId : null;
            var cornerId = fixedRows > 0 && fixedCols > 0 ? "fch0_" + tableId : null;

            removeOverlay(colOverlayId);
            if (rowOverlayId) {
              removeOverlay(rowOverlayId);
            }
            if (cornerId) {
              removeOverlay(cornerId);
            }

            // Native fcgh0 clones the zero-height spacer TR (column widths) then FixedData header rows.
            var colIds = [tableId];
            var everyForHeader = allRows(table);
            for (var s = 0; s < everyForHeader.length; s++) {
              var spacer = everyForHeader[s];
              if (spacer.getAttribute("HEIGHT") === "0" || spacer.getAttribute("aria-hidden") === "true") {
                if (!spacer.id) {
                  spacer.id = tableId + "r";
                }
                colIds.push(spacer.id);
                break;
              }
            }
            for (var i = 0; i < fixedRows; i++) {
              colIds.push(rows[i].id);
            }
            if (!fh.CreateFixedColumnHeader(colIds, colOverlayId)) {
              return false;
            }

            var firstColId = null;
            var lastColId = null;
            if (fixedCols > 0) {
              var rowIds = [tableId];
              var every = allRows(table);
              for (var r = 0; r < every.length; r++) {
                var row = every[r];
                if (!row.id) {
                  row.id = tableId + "_fr" + r;
                }
                rowIds.push(row.id);
                var ends = collectFixedCellIds(row, tableId, r, fixedCols, rowIds);
                if (ends.firstId && !firstColId) {
                  firstColId = ends.firstId;
                }
                if (ends.lastId) {
                  lastColId = ends.lastId;
                }
              }
              if (!fh.CreateFixedRowHeader(rowIds, rowOverlayId)) {
                return false;
              }
            }

            if (cornerId) {
              var cornerIds = [tableId];
              // Include spacer TR first (native fch0 is spacer + FixedData header rows).
              for (var cs = 0; cs < everyForHeader.length; cs++) {
                var cspacer = everyForHeader[cs];
                if (cspacer.getAttribute("HEIGHT") === "0" || cspacer.getAttribute("aria-hidden") === "true") {
                  if (!cspacer.id) {
                    cspacer.id = tableId + "r";
                  }
                  cornerIds.push(cspacer.id);
                  collectFixedCellIds(cspacer, tableId, -1, fixedCols, cornerIds);
                  break;
                }
              }
              for (var cr = 0; cr < fixedRows; cr++) {
                cornerIds.push(rows[cr].id);
                collectFixedCellIds(rows[cr], tableId, cr, fixedCols, cornerIds);
              }
              if (!fh.CreateFixedRowHeader(cornerIds, cornerId)) {
                return false;
              }
            }

            var measureId = rows[0].id;
            global.__ssrsFixedHeaderShow = function () {
              fh.ShowFixedTablixHeaders(
                tableId,
                measureId,
                rowOverlayId || "",
                colOverlayId,
                cornerId || "",
                firstColId || "",
                lastColId || "");
            };
            global.__ssrsFixedHeaderShow();
            return true;
          }

          function stickyBackground(cell, fallback) {
            var bg = getComputedStyle(cell).backgroundColor;
            if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
              bg = fallback;
            }
            cell.style.backgroundColor = bg;
          }

          function stickySeamShadow(cell, rightSeam, bottomSeam) {
            var parts = [];
            if (rightSeam) {
              parts.push("1px 0 0 0 #000");
            }
            if (bottomSeam) {
              parts.push("0 1px 0 0 #000");
            }
            cell.style.boxShadow = parts.length ? parts.join(",") : "";
          }

          function applyStickyFallback(table, fixedRows, fixedCols) {
            if (table.getAttribute("data-ssrs-sticky-applied") === "1") {
              return;
            }
            var rows = contentRows(table);
            if (rows.length === 0) {
              return;
            }
            var lefts = [];
            var left = 0;
            if (fixedCols > 0) {
              var measure = rows[Math.min(fixedRows, rows.length - 1)] || rows[0];
              forEachColumnCell(measure, function (cell, start, end) {
                if (start >= fixedCols) {
                  return;
                }
                if (start === end) {
                  lefts[start] = left;
                  left += cell.getBoundingClientRect().width;
                } else {
                  var slice = cell.getBoundingClientRect().width / (end - start + 1);
                  for (var c = start; c <= end && c < fixedCols; c++) {
                    lefts[c] = left;
                    left += slice;
                  }
                }
              });
            }
            var top = 0;
            for (var r = 0; r < rows.length; r++) {
              var row = rows[r];
              var isHeaderRow = r < fixedRows;
              var rowTop = isHeaderRow ? top : 0;
              forEachColumnCell(row, function (cell, start, end) {
                var freezeLeft = fixedCols > 0 && start < fixedCols;
                var freezeTop = isHeaderRow;
                if (!freezeLeft && !freezeTop) {
                  return;
                }
                cell.style.position = "sticky";
                if (freezeTop) {
                  cell.style.top = rowTop + "px";
                }
                if (freezeLeft) {
                  cell.style.left = (lefts[start] || 0) + "px";
                }
                cell.style.zIndex = freezeTop && freezeLeft ? "5" : freezeTop ? "4" : "3";
                stickyBackground(cell, freezeTop ? "#e6e6e6" : "#fff");
                stickySeamShadow(
                  cell,
                  freezeLeft && end >= fixedCols - 1,
                  freezeTop && r === fixedRows - 1);
              });
              if (isHeaderRow) {
                top += row.getBoundingClientRect().height;
              }
            }
            table.setAttribute("data-ssrs-sticky-applied", "1");
          }

          global.CreateFixedHeaders = function CreateFixedHeaders() {
            var reportDiv = document.getElementById("oReportDiv");
            if (!reportDiv) {
              return;
            }
            // Match ReportViewer scrollport: overflow:auto + position:relative (native
            // puts this on the viewer frame; ShowFixedTablixHeaders walks to overflow:auto).
            reportDiv.style.overflow = "auto";
            reportDiv.style.position = "relative";
            reportDiv.style.height = "100%";
            reportDiv.style.width = "100%";
            var reportCell = document.getElementById("oReportCell") || reportDiv;
            var tables = reportDiv.querySelectorAll(
              "table[cols][data-ssrs-fixed-rows], table[COLS][data-ssrs-fixed-rows], table[cols][data-ssrs-fixed-cols], table[COLS][data-ssrs-fixed-cols]");
            for (var t = 0; t < tables.length; t++) {
              var table = tables[t];
              if (table.getAttribute("data-ssrs-fh-wired") === "1") {
                continue;
              }
              var fixedRows = parseInt(table.getAttribute("data-ssrs-fixed-rows") || "0", 10) || 0;
              var fixedCols = parseInt(table.getAttribute("data-ssrs-fixed-cols") || "0", 10) || 0;
              if (fixedRows <= 0 && fixedCols <= 0) {
                continue;
              }
              if (wireMicrosoftFixedHeader(table, reportDiv, reportCell, fixedRows, fixedCols)) {
                table.setAttribute("data-ssrs-fh-wired", "1");
              } else {
                applyStickyFallback(table, fixedRows, fixedCols);
              }
            }
          };

          global.SsrsWireFixedHeaders = function SsrsWireFixedHeaders(root) {
            var reportDiv = (root || document).querySelector
              ? (root || document).querySelector("#oReportDiv")
              : document.getElementById("oReportDiv");
            if (!reportDiv) {
              return;
            }
            reportDiv.onscroll = function () {
              if (typeof global.__ssrsFixedHeaderShow === "function") {
                global.__ssrsFixedHeaderShow();
              }
            };
            reportDiv.onresize = function () {
              if (typeof global.__ssrsFixedHeaderShow === "function") {
                global.__ssrsFixedHeaderShow();
              }
            };
            global.CreateFixedHeaders();
          };
        })(typeof window !== "undefined" ? window : globalThis);
        """;
}
