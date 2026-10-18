import {
  postSessionAction,
  type ParameterSubmission,
  type RenderResponse,
} from '../../reportApi'

/** Drillthrough into a child Report within the current Viewer Session (pushes back stack). */
export function drillthroughReport(
  sessionId: string,
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'drillthrough', { reportPath, parameters })
}

/** Pop the Drillthrough back stack and restore the prior Viewer Session entry. */
export function goBack(sessionId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'back')
}
