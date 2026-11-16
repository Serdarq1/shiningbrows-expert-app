# Reliability checks

Install the Python dependencies from `requirements.txt`, then run:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

The frontend checks use jsdom with rendered Flask templates and fake services. Install jsdom in a temporary directory, then run from the repository root:

```sh
npm install --prefix /tmp/sb-browser-tests jsdom
NODE_PATH=/tmp/sb-browser-tests/node_modules PYTHON_BIN=python3 node tests/frontend.cjs
```

They cover initial request count, revisiting tabs, product images, cart confirmation, Turkish and English price visibility, English fallback for other device languages, concurrent reads, additional authentication steps and temporary authorization failures.

Before release, verify with a test account on Android and iPhone: cold launch, session restoration after closing the app, Clerk verification challenges, password reset, and slow or interrupted connections. The automated authentication tests mock Clerk; they cannot confirm production provider settings.

The interface uses Turkish when the primary browser or device language is Turkish and English otherwise. Database content, including product descriptions and expert posts, remains in its original language. Product prices are hidden in the non Turkish interface; this is a display rule, not an API access restriction.
