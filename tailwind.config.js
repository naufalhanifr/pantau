// CSS Tailwind statis untuk monitoring & admin (pengganti CDN yang mengompilasi di browser).
// Setelah menambah/mengubah class Tailwind di web/, build ulang: npx -y tailwindcss@3.4.17 -o web/shared/tailwind.css --minify
module.exports = { content: ["web/**/*.{html,js}", "!web/shared/vendor/**"] };
