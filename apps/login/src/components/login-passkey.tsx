"use client";

import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { sendPasskey } from "@/lib/server/passkeys";
import { updateOrCreateSession } from "@/lib/server/session";
import { create, JsonObject } from "@zitadel/client";
import { RequestChallengesSchema, UserVerificationRequirement } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { Checks } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

// either loginName or sessionId must be provided
type Props = {
  loginName?: string;
  sessionId?: string;
  requestId?: string;
  altPassword: boolean;
  login?: boolean;
  organization?: string;
};

/**
 * Safari (macOS e iOS, incluindo Chrome/Firefox no iOS, que usam WebKit) só abre
 * o Touch ID/Face ID se o `navigator.credentials.get` for chamado no próprio
 * clique do utilizador. Sem gesto, ou depois de um pedido de rede à espera, dá
 * `NotAllowedError` ("verificação cancelada") na 1.ª tentativa.
 */
export function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/.test(ua);
  return ios || safari;
}

export function LoginPasskey({ loginName, sessionId, requestId, altPassword, organization, login = true }: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const t = useTranslations("passkey");
  const router = useRouter();

  const initialized = useRef(false);
  // Desafio WebAuthn pedido de antemão (só em WebKit), guardado como JSON porque
  // `submitLoginAndContinue` converte os campos para ArrayBuffer em place.
  const prefetchedChallenge = useRef<string | null>(null);
  // Marca falha na tentativa actual (para só voltar a pedir desafio quando falhou).
  const attemptFailed = useRef(false);

  async function prefetchChallenge(keepError = false) {
    try {
      const response = await updateOrCreateSessionForChallenge(undefined, keepError);
      const pK = response?.challenges?.webAuthN?.publicKeyCredentialRequestOptions?.publicKey;
      if (!pK) {
        setError(t("verify.errors.couldNotRequestChallenge"));
        return;
      }
      prefetchedChallenge.current = JSON.stringify(pK);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (isWebKit()) {
        // Sem prompt automático: pede só o desafio; o Touch ID abre no clique em "Continuar".
        void prefetchChallenge();
        return;
      }
      setLoading(true);
      updateOrCreateSessionForChallenge()
        .then((response) => {
          const pK = response?.challenges?.webAuthN?.publicKeyCredentialRequestOptions?.publicKey;

          if (!pK) {
            setError(t("verify.errors.couldNotRequestChallenge"));
            setLoading(false);
            return;
          }

          return submitLoginAndContinue(pK)
            .catch((error) => {
              setError(error instanceof Error ? error.message : String(error));
              return;
            })
            .finally(() => {
              setLoading(false);
            });
        })
        .catch((error) => {
          setError(error instanceof Error ? error.message : String(error));
          return;
        })
        .finally(() => {
          setLoading(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateOrCreateSessionForChallenge(
    userVerificationRequirement: number = login
      ? UserVerificationRequirement.REQUIRED
      : UserVerificationRequirement.DISCOURAGED,
    keepError = false,
  ) {
    if (!keepError) setError("");
    setLoading(true);
    const sessionResponse = await updateOrCreateSession({
      loginName,
      sessionId,
      organization,
      challenges: create(RequestChallengesSchema, {
        webAuthN: {
          domain: "",
          userVerificationRequirement,
        },
      }),
      requestId,
    })
      .catch((error) => {
        console.error(error);
        setError(t("verify.errors.couldNotRequestChallenge"));
        return;
      })
      .finally(() => {
        setLoading(false);
      });

    if (sessionResponse && "error" in sessionResponse && sessionResponse.error) {
      setError(sessionResponse.error);
      return;
    }

    return sessionResponse;
  }

  async function submitLogin(data: JsonObject) {
    setLoading(true);
    try {
      const response = await sendPasskey({
        loginName,
        sessionId,
        organization,
        checks: {
          webAuthN: { credentialAssertionData: data },
        } as Checks,
        requestId,
      });

      const handled = handleServerActionResponse(response, router, setSamlData, setError);

      if (!handled) {
        attemptFailed.current = true;
        if (!response) {
          setError(t("verify.errors.noResponseReceived"));
        } else {
          setError(t("verify.errors.noRedirectProvided"));
        }
      }
    } catch {
      attemptFailed.current = true;
      setError(t("verify.errors.couldNotVerifyPasskey"));
    } finally {
      setLoading(false);
    }
  }

  async function submitLoginAndContinue(publicKey: any): Promise<boolean | void> {
    publicKey.challenge = coerceToArrayBuffer(publicKey.challenge, "publicKey.challenge");
    publicKey.allowCredentials.map((listItem: any) => {
      listItem.id = coerceToArrayBuffer(listItem.id, "publicKey.allowCredentials.id");
    });

    return navigator.credentials
      .get({
        publicKey,
      })
      .then((assertedCredential: any) => {
        if (!assertedCredential) {
          setError(t("verify.errors.couldNotRetrievePasskey"));
          return;
        }

        const authData = new Uint8Array(assertedCredential.response.authenticatorData);
        const clientDataJSON = new Uint8Array(assertedCredential.response.clientDataJSON);
        const rawId = new Uint8Array(assertedCredential.rawId);
        const sig = new Uint8Array(assertedCredential.response.signature);
        const userHandle = new Uint8Array(assertedCredential.response.userHandle);
        const data = {
          id: assertedCredential.id,
          rawId: coerceToBase64Url(rawId, "rawId"),
          type: assertedCredential.type,
          response: {
            authenticatorData: coerceToBase64Url(authData, "authData"),
            clientDataJSON: coerceToBase64Url(clientDataJSON, "clientDataJSON"),
            signature: coerceToBase64Url(sig, "sig"),
            userHandle: coerceToBase64Url(userHandle, "userHandle"),
          },
        };

        return submitLogin(data);
      })
      .catch((error) => {
        attemptFailed.current = true;
        // Handle passkey cancellation or errors
        if (error?.name === "NotAllowedError") {
          setError(t("verify.errors.verificationCancelled"));
        } else {
          setError(t("verify.errors.verificationFailed"));
        }
        console.error("Passkey verification error:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="w-full">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      {error && (
        <div className="py-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-8 flex w-full flex-row items-center">
        {altPassword ? (
          <Button
            type="button"
            variant={ButtonVariants.Secondary}
            onClick={() => {
              const params = new URLSearchParams();

              if (loginName) {
                params.append("loginName", loginName);
              }

              if (sessionId) {
                params.append("sessionId", sessionId);
              }

              if (requestId) {
                params.append("requestId", requestId);
              }

              if (organization) {
                params.append("organization", organization);
              }

              return router.push(
                "/password?" + params, // alt is set because password is requested as alternative auth method, so passkey prompt can be escaped
              );
            }}
            data-testid="password-button"
          >
            <Translated i18nKey="verify.usePassword" namespace="passkey" />
          </Button>
        ) : (
          <BackButton />
        )}

        <span className="flex-grow"></span>
        <Button
          type="submit"
          className="self-end"
          variant={ButtonVariants.Primary}
          disabled={loading}
          onClick={async () => {
            if (prefetchedChallenge.current) {
              // Chamada síncrona dentro do gesto do clique (obrigatório no Safari).
              const pK = JSON.parse(prefetchedChallenge.current);
              prefetchedChallenge.current = null;
              setError("");
              setLoading(true);
              return submitLoginAndContinue(pK)
                .catch((error) => {
                  setError(error instanceof Error ? error.message : String(error));
                })
                .finally(() => {
                  setLoading(false);
                  // O desafio é de uso único: se falhou, pede outro para a próxima tentativa
                  // (depois de um sucesso a página redirecciona, não se mexe na sessão).
                  if (attemptFailed.current) {
                    attemptFailed.current = false;
                    void prefetchChallenge(true);
                  }
                });
            }
            const response = await updateOrCreateSessionForChallenge().finally(() => {
              setLoading(false);
            });

            const pK = response?.challenges?.webAuthN?.publicKeyCredentialRequestOptions?.publicKey;

            if (!pK) {
              setError(t("verify.errors.couldNotRequestChallenge"));
              return;
            }

            setLoading(true);

            return submitLoginAndContinue(pK)
              .catch((error) => {
                setError(error instanceof Error ? error.message : String(error));
                return;
              })
              .finally(() => {
                setLoading(false);
              });
          }}
          data-testid="submit-button"
        >
          {loading && <Spinner className="mr-2 h-5 w-5" />} <Translated i18nKey="verify.submit" namespace="passkey" />
        </Button>
      </div>
    </div>
  );
}
