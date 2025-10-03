import { useEffect, useState } from "react";
import "./App.css";

export default function App() {
  const [loading, setLoading] = useState(true);

  // splash de carga breve
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <header className="appbar">BrayanApp</header>
      <main className="container">
        {loading ? (
          <div className="splash">
            <div className="logo" aria-label="logo" />
            <p>Cargando…</p>
          </div>
        ) : (
          <section>
            <h1>Home</h1>
            <p>App Shell listo. Carga rápida y base para funcionar offline.</p>
            <button id="installBtn" hidden>Instalar</button>
          </section>
        )}
      </main>
    </>
  );
}
