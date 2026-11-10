import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";

import { config } from "./config";

const scopes = ["https://api.powerplatform.com/.default"];

const msal = new PublicClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
});

let initialization: Promise<void> | undefined;

function initialize(): Promise<void> {
  initialization ??= msal.initialize();
  return initialization;
}

export async function acquirePowerPlatformToken(): Promise<AuthenticationResult> {
  await initialize();

  const activeAccount = msal.getActiveAccount();
  let account: AccountInfo | null =
    activeAccount?.tenantId === config.tenantId
      ? activeAccount
      : msal.getAllAccounts().find((candidate) => candidate.tenantId === config.tenantId) ?? null;

  if (!account) {
    const login = await msal.loginPopup({ scopes, prompt: "select_account" });
    account = login.account;
    msal.setActiveAccount(account);
  }

  try {
    return await msal.acquireTokenSilent({ scopes, account });
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      throw error;
    }

    return msal.acquireTokenPopup({ scopes, account });
  }
}
