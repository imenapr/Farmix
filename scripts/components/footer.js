import { APP } from "../app/config.js";

function renderFooter() {
  const year = new Date().getFullYear();
  return `
    <footer class="footer">
      <div class="container footer-inner">
        <div class="footer-top">
          <div class="brand" aria-label="${APP.name}">
            <img src="/img/logo.png" alt="" />
            <div>
              <div class="brand-name">${APP.name}</div>
              <div class="muted" style="font-size: var(--text-sm);">${APP.slogan}</div>
            </div>
          </div>
          <div class="footer-links" aria-label="Footer links">
            <a href="/pages/marketplace.html">Marketplace</a>
            <a href="/pages/for-farmers.html">Farmers</a>
            <a href="/pages/for-businesses.html">Businesses</a>
            <a href="/pages/account.html">Account</a>
          </div>
        </div>
        <div class="muted" style="font-size: var(--text-sm);">© ${year} ${APP.name}. MVP demo build.</div>
      </div>
    </footer>
  `;
}

export function mountFooter(targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = renderFooter();
}

