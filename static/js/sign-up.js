const CLERK_ERRORS_TR = {
  form_identifier_exists: "Bu e-posta adresi zaten kayıtlı.",
  form_password_pwned: "Bu şifre güvenli değil. Lütfen başka bir şifre seçin.",
  form_password_length_too_short: "Şifre çok kısa.",
  form_code_incorrect: "Doğrulama kodu hatalı. Lütfen tekrar deneyin.",
  too_many_requests: "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.",
  strategy_for_user_invalid: "Bu işlem bu hesap için kullanılamıyor.",
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

  const form = document.getElementById("sign-up-form");
  const signUpFields = document.getElementById("sign-up-fields");
  const verifyFields = document.getElementById("verify-fields");
  const legalText = document.getElementById("legal-text");
  const errorBox = document.getElementById("error-message");
  const submitButton = document.getElementById("submit-button");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");

  let currentSignUp = null;

  const updateSubmitState = () => {
    submitButton.disabled = !form.checkValidity();
  };
  form.addEventListener("input", updateSubmitState);
  form.addEventListener("change", updateSubmitState);
  updateSubmitState();

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
    }
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

  const setStep = (step) => {
    form.dataset.step = step;
    // ponytail: .hidden class is CSS-only; the `hidden` IDL prop also bars these fields from checkValidity()
    signUpFields.classList.toggle("hidden", step !== "sign-up");
    signUpFields.hidden = step !== "sign-up";
    legalText.classList.toggle("hidden", step !== "sign-up");
    legalText.hidden = step !== "sign-up";
    verifyFields.classList.toggle("hidden", step !== "verify");
    verifyFields.hidden = step !== "verify";
    submitButton.textContent = step === "sign-up" ? "Kayıt Ol" : "Doğrula";
    clearError();
    updateSubmitState();
  };
  setStep(form.dataset.step);

  document.getElementById("toggle-password").addEventListener("click", () => {
    passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  });
  document.getElementById("toggle-confirm-password").addEventListener("click", () => {
    confirmPasswordInput.type = confirmPasswordInput.type === "password" ? "text" : "password";
  });

  const resendButton = document.getElementById("resend-code-link");
  const resendDefaultText = resendButton.textContent;
  const RESEND_COOLDOWN_SECONDS = 15;
  let resendCountdownTimer = null;

  const startResendCooldown = (seconds) => {
    resendButton.disabled = true;
    resendButton.classList.remove("text-gold-600");
    resendButton.classList.add("text-green-600");
    let remaining = seconds;
    resendButton.textContent = `Kod gönderildi (${remaining})`;
    resendCountdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendCountdownTimer);
        resendButton.disabled = false;
        resendButton.textContent = resendDefaultText;
        resendButton.classList.remove("text-green-600");
        resendButton.classList.add("text-gold-600");
      } else {
        resendButton.textContent = `Kod gönderildi (${remaining})`;
      }
    }, 1000);
  };

  resendButton.addEventListener("click", async () => {
    if (!currentSignUp) return;
    resendButton.disabled = true;
    try {
      currentSignUp = await currentSignUp.prepareEmailAddressVerification({ strategy: "email_code" });
      startResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.error("Clerk resend code error:", err && err.errors ? err.errors : err);
      showError(clerkErrorMessage(err));
      resendButton.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    submitButton.disabled = true;

    try {
      if (form.dataset.step === "sign-up") {
        const password = passwordInput.value;
        if (password !== confirmPasswordInput.value) {
          showError("Şifreler eşleşmiyor.");
          return;
        }
        currentSignUp = await Clerk.client.signUp.create({
          firstName: document.getElementById("first-name").value.trim(),
          lastName: document.getElementById("last-name").value.trim(),
          emailAddress: document.getElementById("email").value.trim(),
          password,
        });
        if (currentSignUp.status === "complete") {
          await finishAuth(currentSignUp.createdSessionId);
        } else if (currentSignUp.unverifiedFields && currentSignUp.unverifiedFields.includes("email_address")) {
          currentSignUp = await currentSignUp.prepareEmailAddressVerification({ strategy: "email_code" });
          setStep("verify");
        } else {
          showError("Beklenmeyen bir adım gerekiyor. Lütfen destek ile iletişime geçin.");
        }
      } else if (form.dataset.step === "verify") {
        const code = document.getElementById("verify-code").value.trim();
        currentSignUp = await currentSignUp.attemptEmailAddressVerification({ code });
        if (currentSignUp.status === "complete") {
          await finishAuth(currentSignUp.createdSessionId);
        } else {
          showError("Beklenmeyen bir adım gerekiyor. Lütfen destek ile iletişime geçin.");
        }
      }
    } catch (err) {
      console.error("Clerk sign-up error:", err && err.errors ? err.errors : err);
      showError(clerkErrorMessage(err));
    } finally {
      updateSubmitState();
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
