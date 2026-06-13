import { APP } from "../app/config.js";
import { t, onLanguageChange } from "../app/i18n.js";

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
            <a href="/pages/marketplace.html">${t("footer.marketplace")}</a>
            <a href="/pages/for-farmers.html">${t("footer.farmers")}</a>
            <a href="/pages/for-businesses.html">${t("footer.businesses")}</a>
            <a href="/pages/account.html">${t("footer.account")}</a>
          </div>
        </div>
        <div class="muted" style="font-size: var(--text-sm);">© ${year} ${APP.name}. ${t("footer.copyright")}</div>
      </div>
    </footer>
  `;
}

export function mountFooter(targetEl) {
  if (!targetEl) return () => {};

  function render() {
    targetEl.innerHTML = renderFooter();
  }

  render();
  const unsub = onLanguageChange(render);
  return unsub;
}
