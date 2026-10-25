(() => {
  const menu = document.querySelector("#main-nav");
  const toggle = document.querySelector(".menu-toggle");
  const dialog = document.querySelector("#notice-dialog");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogMessage = document.querySelector("#dialog-message");

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
    });
  });

  document.querySelectorAll("[data-unavailable]").forEach((button) => {
    button.addEventListener("click", () => {
      const feature = button.dataset.unavailable;
      dialogTitle.textContent = `${feature} is not available yet`;
      dialogMessage.textContent = "This V2 homepage preview does not collect or send information. The feature will be linked here after its new implementation is ready and tested.";
      dialog.showModal();
    });
  });

  document.querySelector("#dialog-ok").addEventListener("click", () => dialog.close());
})();
