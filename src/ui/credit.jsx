// Signature de l'éditeur, présente sur toutes les pages
export function Credit({ dark = false }) {
  return (
    <p className={`credit ${dark ? 'dark' : ''}`}>
      Produit par <a href="https://www.ibtech.click/" target="_blank" rel="noreferrer">IbtecH</a>
    </p>
  );
}
