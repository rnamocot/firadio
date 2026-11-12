// Apply the saved theme before the page paints (light by default, regardless of the phone's setting).
(function () {
  var t = "light";
  try { t = localStorage.getItem("filradio.theme") || "light"; } catch (e) {}
  if (t === "dark") document.documentElement.classList.add("dark");
})();
