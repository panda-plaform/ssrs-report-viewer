# Anonymous API with Service Account NTLM

End users do not authenticate to the API in v1; the API reaches on-prem SSRS only as a configured Service Account via NTLM (credentials from config / User Secrets / env). We rejected per-user SSRS identity and API keys for v1 to keep the first slice focused on Report Viewer behaviour. Callers who can reach the API are an open proxy to whatever that Service Account can see—network controls are required.
