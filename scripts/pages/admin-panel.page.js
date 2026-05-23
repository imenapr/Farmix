const navButtons = document.querySelectorAll('.adm-nav-item');

function renderListings() {
  listingsMount.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table">
        ...
      </table>
    </div>
  `;
}


function toggleTheme(){
  document.body.classList.toggle('light-mode');

  const isLight = document.body.classList.contains('light-mode');

  themeToggle.textContent = isLight ? '🌙' : '☀';
}

themeToggle.addEventListener('click', toggleTheme);

logoutBtn.addEventListener('click', () => {
  alert('Signing out...');
});

userName.textContent = 'Nick · Administrator';

renderStats();
renderUsers();
renderListings();
renderAnalytics();
initAuthSession();