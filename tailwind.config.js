// Configuración de Tailwind para generar public/estilos-tailwind.css.
// Antes cada página cargaba Tailwind desde cdn.tailwindcss.com, que según la
// documentación de Tailwind es solo para desarrollo (arma los estilos en el
// navegador de cada visitante). Ahora la hoja se genera una vez, al publicar.
// Si agregas clases nuevas en las páginas: npm run css
module.exports = {
  content: ['./public/*.html'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'sans-serif'], serif: ['Playfair Display', 'serif'] },
      colors: {
        // Paleta "Rubor": frambuesa (el color del logo) como acento, rubor en
        // encabezado y pie, tinta berenjena para el texto.
        brandFuchsia: '#A3284F',   // frambuesa: botones y acentos
        brandLightPink: '#B73A61', // frambuesa clara: enlaces y estados hover
        brandDark: '#3A2130',      // tinta
        brandGray: '#FFFAFB',      // fondo
        // Grises cálidos (con un toque rosado) en lugar de los grises azulados de
        // Tailwind; tienen igual o mejor contraste que los originales.
        gray: { 50: '#FAF8F8', 100: '#F4F0F1', 200: '#E9E2E4', 300: '#D8CED1', 400: '#A0939A', 500: '#6F6268', 600: '#524850', 700: '#3F353A', 800: '#2A2226', 900: '#1A1417' },
        pink: { 50: '#FCF1F4', 100: '#F8E6EA', 200: '#EFD3DA', 300: '#E2AFBD', 400: '#CE7892', 500: '#B8466B', 600: '#A3284F', 700: '#86203F', 800: '#6A1932', 900: '#521327' }
      }
    }
  }
};
