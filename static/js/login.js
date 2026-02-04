window.addEventListener("load", async () => {
  if (typeof Clerk === "undefined") return;
  const appearance = {
    variables: {
      borderRadius: "8px",
      fontFamily: "Manrope, ui-sans-serif, system-ui",
      colorBackground: "#ffffff",
    },
    elements: {
      card: "shadow-none border border-gray-200 rounded-xl",
      formFieldInput: "rounded-lg",
      dividerLine: "bg-gray-200",
    },
  };

  const localization = window.trTR || null;
  const loadOptions = {
    appearance,
    signInUrl: "/login",
    signUpUrl: "/sign-up",
    afterSignInUrl: "/login",
    afterSignUpUrl: "/login",
  };
  if (localization) {
    loadOptions.localization = localization;
  }
  await Clerk.load(loadOptions);

  const app = document.getElementById("app");
  if (!app) return;

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
    app.innerHTML = '<div id="user-button"></div>';
    const userButtonDiv = document.getElementById("user-button");
    Clerk.mountUserButton(userButtonDiv);
  } else {
    app.innerHTML = '<div id="sign-in"></div>';
    const signInDiv = document.getElementById("sign-in");
    Clerk.mountSignIn(signInDiv, { appearance });
  }
});
