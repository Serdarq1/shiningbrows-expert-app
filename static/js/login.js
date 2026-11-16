const CLERK_ERRORS_TR = {
  form_identifier_not_found: "Bu e-posta adresiyle bir hesap bulunamadı.",
  form_password_incorrect: "Şifre hatalı. Lütfen tekrar deneyin.",
  form_code_incorrect: "Doğrulama kodu hatalı. Lütfen tekrar deneyin.",
  form_password_pwned: "Bu şifre güvenli değil. Lütfen başka bir şifre seçin.",
  form_password_length_too_short: "Şifre çok kısa.",
  too_many_requests: "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.",
  strategy_for_user_invalid: "Bu hesap için şifre ile giriş kullanılamıyor. Lütfen şifremi unuttum bağlantısıyla bir şifre belirleyin.",
};

const GENERIC_ERROR_TR = "Bir şeyler ters gitti. Lütfen tekrar deneyin.";

function clerkErrorMessage(err) {
  const apiError = err && err.errors && err.errors[0];
  if (!apiError) return GENERIC_ERROR_TR;
  return CLERK_ERRORS_TR[apiError.code] || GENERIC_ERROR_TR;
}

window.addEventListener("load", async () => {
  try {
    if (typeof Clerk === "undefined") throw new Error("Clerk unavailable");
    await Clerk.load(window.SBLocale?.language === "tr" && window.trTR ? { localization: window.trTR } : {});
  } catch (err) {
    const errorBox = document.getElementById("error-message");
    errorBox.textContent = window.SBLocale?.language === "en" ? "Sign in could not load. Check your connection and reload." : "Giriş yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.";
    errorBox.classList.remove("hidden");
    return;
  }

  const form = document.getElementById("sign-in-form");
  const signInFields = document.getElementById("sign-in-fields");
  const resetRequestFields = document.getElementById("reset-request-fields");
  const resetConfirmFields = document.getElementById("reset-confirm-fields");
  const errorBox = document.getElementById("error-message");
  const submitButton = document.getElementById("submit-button");
  const forgotLink = document.getElementById("forgot-password-link");
  const backLink = document.getElementById("back-link");
  const togglePasswordButton = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");

  let resetSignIn = null;

  // ponytail: form.checkValidity() does NOT skip hidden required fields from other steps,
  // so filter to fields that are actually visible right now (checkVisibility covers display:none + [hidden])
  const isVisible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const updateSubmitState = () => {
    const fields = [...form.querySelectorAll("[required]")];
    submitButton.disabled = !fields.every((el) => !isVisible(el) || el.checkValidity());
  };
  form.addEventListener("input", updateSubmitState);
  form.addEventListener("change", updateSubmitState);
  updateSubmitState();

  const finishAuth = async (sessionId) => {
    if (sessionId) await Clerk.setActive({ session: sessionId });
    const token = await Clerk.session.getToken({ skipCache: true });
    const res = await fetch("/api/clerk/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
      return true;
    }
    throw new Error("authorization_unavailable");
  };

  const showMessage = (message, isInfo = false) => {
    errorBox.textContent = window.SBLocale?.t(message) || message;
    errorBox.classList.remove("hidden", "text-red-600", "text-zinc-700");
    errorBox.classList.add(isInfo ? "text-zinc-700" : "text-red-600");
  };

  const showError = (message) => showMessage(message, false);

  const clearError = () => {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
  };

  const showVerification = () => {
    form.classList.add("hidden");
    let verification = document.getElementById("clerk-verification");
    if (!verification) {
      verification = document.createElement("div");
      verification.id = "clerk-verification";
      form.after(verification);
    }
    Clerk.mountSignIn(verification, {
      routing: "hash",
      forceRedirectUrl: "/login",
      signUpUrl: "/sign-up",
    });
  };

  const startPasswordReset = async (email) => {
    try {
      resetSignIn = await Clerk.client.signIn.create({ identifier: email });
      const emailFactor = (resetSignIn.supportedFirstFactors || []).find(
        (factor) => factor.strategy === "reset_password_email_code"
      );
      if (!emailFactor) {
        showError("Bu hesap için şifre sıfırlama desteklenmiyor.");
        return false;
      }
      resetSignIn = await resetSignIn.prepareFirstFactor({
        strategy: "reset_password_email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      setStep("reset-confirm");
      return true;
    } catch (err) {
      console.error("Clerk password reset error:", err && err.errors ? err.errors : err);
      showError(clerkErrorMessage(err));
      return false;
    }
  };

  const setStep = (step) => {
    form.dataset.step = step;
    signInFields.classList.toggle("hidden", step !== "sign-in");
    resetRequestFields.classList.toggle("hidden", step !== "reset-request");
    resetConfirmFields.classList.toggle("hidden", step !== "reset-confirm");
    forgotLink.classList.toggle("hidden", step !== "sign-in");
    backLink.classList.toggle("hidden", step === "sign-in");
    submitButton.textContent =
      step === "sign-in" ? "Giriş Yap" : step === "reset-request" ? "Kod Gönder" : "Şifreyi Güncelle";
    clearError();
    updateSubmitState();
  };
  setStep(form.dataset.step);

  togglePasswordButton.addEventListener("click", () => {
    passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  });

  forgotLink.addEventListener("click", () => setStep("reset-request"));
  backLink.addEventListener("click", () => setStep("sign-in"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    submitButton.disabled = true;

    try {
      if (form.dataset.step === "sign-in") {
        const email = document.getElementById("email").value.trim();
        const password = passwordInput.value;
        const signInAttempt = await Clerk.client.signIn.create({
          identifier: email,
          password,
          strategy: "password",
        });
        if (signInAttempt.status === "complete") {
          await finishAuth(signInAttempt.createdSessionId);
        } else {
          showVerification();
        }
      } else if (form.dataset.step === "reset-request") {
        const email = document.getElementById("reset-email").value.trim();
        await startPasswordReset(email);
      } else if (form.dataset.step === "reset-confirm") {
        const code = document.getElementById("reset-code").value.trim();
        const newPassword = document.getElementById("reset-new-password").value;
        const attempt = await resetSignIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code,
          password: newPassword,
        });
        if (attempt.status === "complete") {
          await finishAuth(attempt.createdSessionId);
        } else {
          showVerification();
        }
      }
    } catch (err) {
      form.classList.remove("hidden");
      const code = err && err.errors && err.errors[0] && err.errors[0].code;
      if (form.dataset.step === "sign-in" && code === "strategy_for_user_invalid") {
        const email = document.getElementById("email").value.trim();
        const started = await startPasswordReset(email);
        if (started) {
          showMessage(
            "Bu hesap için bir şifre tanımlı değil. E-postanıza gönderdiğimiz kod ile yeni bir şifre belirleyebilirsiniz.",
            true
          );
        }
      } else {
        console.error("Clerk sign-in error:", err && err.errors ? err.errors : err);
        showError(clerkErrorMessage(err));
      }
    } finally {
      updateSubmitState();
    }
  });

  if (Clerk.isSignedIn) {
    try {
      const token = await Clerk.session.getToken({ skipCache: true });
      const res = await fetch("/api/clerk/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        window.location.href = "/dashboard";
        return;
      }
    } catch (err) {
      console.error(err);
    }
    showError(window.SBLocale?.language === "en"
      ? "We could not restore your session. Please check your connection and reload. You have not been signed out."
      : "Oturumunuz yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin. Oturumunuz kapatılmadı.");
  }
});
