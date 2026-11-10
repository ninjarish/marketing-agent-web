export const config = {
  clientId: import.meta.env.VITE_ENTRA_CLIENT_ID?.trim(),
  tenantId: import.meta.env.VITE_ENTRA_TENANT_ID?.trim(),
  agentUrl: import.meta.env.VITE_AGENT_URL?.trim(),
};

const placeholderId = "00000000-0000-0000-0000-000000000000";

export function getConfigurationError(): string | null {
  if (!config.clientId || config.clientId === placeholderId) {
    return "Set VITE_ENTRA_CLIENT_ID in .env.";
  }

  if (!config.tenantId || config.tenantId === placeholderId) {
    return "Set VITE_ENTRA_TENANT_ID in .env.";
  }

  try {
    if (!config.agentUrl) {
      return "Set VITE_AGENT_URL in .env.";
    }

    const url = new URL(config.agentUrl);
    if (url.protocol !== "https:") {
      return "VITE_AGENT_URL must use HTTPS.";
    }
  } catch {
    return "VITE_AGENT_URL is not a valid URL.";
  }

  return null;
}
