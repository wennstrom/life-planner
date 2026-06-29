// Mockup navigation only — no real functionality.
const navItems = document.querySelectorAll(".nav-item[data-section]");
const views = document.querySelectorAll(".view");

function showSection(section) {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.section === section);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${section}`);
  });
  if (location.hash !== `#${section}`) {
    history.replaceState(null, "", `#${section}`);
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => showSection(item.dataset.section));
});

// Restore section from URL hash on load (defaults to "today").
const initial = location.hash.replace("#", "") || "today";
const valid = Array.from(navItems).some((i) => i.dataset.section === initial);
showSection(valid ? initial : "today");
