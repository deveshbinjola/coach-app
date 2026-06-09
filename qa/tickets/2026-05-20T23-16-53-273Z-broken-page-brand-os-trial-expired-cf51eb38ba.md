# Broken page: /brand-os/trial/expired

Severity: high
Area: page

## Evidence
HTTP 200, expected 307 or 308.
<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/e82da6a9ceac2abc.css" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/webpack-472cfb9b50fb7cea.js"/><script src="/_next/static/chunks/fd9d1056-2a847ad2fd23f2ba.js" async=""></script><script src="/_next/static/chunks/5030-beea28ea829c6913.js" async=""></script><script src="/_next/static/chunks/main-app-9a967773bbbb5fda.js" async=""></script><script src="/_next/static/chunks/app/error-bbfb41759bd43ae4.js" async=""></script><script src="/_next/static/chunks/44530001-c49f2e08a548d7b4.js" async=""></script><script src="/_next/static/chunks/2692-9e1236a029f1378b.js" async=""></script><script src="/_next/static/chunks/2972-1ff19a24ac221bdf.js" async=""></script><scrip

## Reproduction
Open http://127.0.0.1:3210/brand-os/trial/expired.

## Next Action
Inspect the route server component and browser console, then rerun npm run qa:daily.

## Ticket Status
Draft only. Review before copying into Linear or another tracker.
