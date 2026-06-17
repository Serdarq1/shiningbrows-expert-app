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
  if (typeof Clerk === "undefined") return;
  await Clerk.load();

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

  const finishAuth = async (sessionId) => {
    await Clerk.setActive({ session: sessionId });
    const token = await Clerk.session.getToken();
    const res = await fetch("/api/clerk/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
      return true;
    }
    return false;
  };

  const showMessage = (message, isInfo = false) => {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden", "text-red-600", "text-zinc-700");
    errorBox.classList.add(isInfo ? "text-zinc-700" : "text-red-600");
  };

  const showError = (message) => showMessage(message, false);

  const clearError = () => {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
  };

  const startPasswordReset = async (email) => {
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
  };

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
          showError("Beklenmeyen bir adım gerekiyor. Lütfen destek ile iletişime geçin.");
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
          showError("Beklenmeyen bir adım gerekiyor. Lütfen destek ile iletişime geçin.");
        }
      }
    } catch (err) {
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
      submitButton.disabled = false;
    }
  });

  if (Clerk.isSignedIn) {
    try {
      const token = await Clerk.session.getToken();
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
    await Clerk.signOut();
  }
});
