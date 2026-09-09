(() => {
  const dateEl = document.getElementById("clock-date");
  const timeEl = document.getElementById("clock-time");
  const frame = document.getElementById("avatar-frame");
  const copyBtn = document.getElementById("copy-discord");
  const discordId = document.getElementById("discord-id");

  const tick = () => {
    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleString("en-GB", {
        month: "short",
        day: "2-digit",
      });
    }
    if (timeEl) {
      timeEl.textContent = now.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  tick();
  setInterval(tick, 1000);

  if (frame) {
    const img = new Image();
    img.alt = "Rampie";
    img.src = "assets/avatar.jpg";
    img.addEventListener("load", () => {
      const letter = frame.querySelector(".avatar-letter");
      if (letter) letter.remove();
      frame.insertBefore(img, frame.firstChild);
      if (!frame.querySelector(".avatar-dither")) {
        const dither = document.createElement("span");
        dither.className = "avatar-dither";
        dither.setAttribute("aria-hidden", "true");
        frame.appendChild(dither);
      }
    });
  }

  if (copyBtn && discordId) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(discordId.textContent.trim());
        copyBtn.textContent = "copied";
        setTimeout(() => {
          copyBtn.textContent = "copy";
        }, 1200);
      } catch {
        copyBtn.textContent = discordId.textContent.trim();
      }
    });
  }

  const open = window.COMMISSIONS_OPEN !== false;
  const word = open ? "OPEN" : "CLOSED";
  document.querySelectorAll("[data-commissions-status]").forEach((el) => {
    el.classList.toggle("is-open", open);
    el.classList.toggle("is-closed", !open);
  });
  document.querySelectorAll("[data-commissions-label]").forEach((el) => {
    el.textContent = word;
  });
})();
