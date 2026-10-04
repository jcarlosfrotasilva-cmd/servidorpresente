"use client";

import { AlertIcon } from "@/components/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#eef3f8",
          fontFamily: "system-ui, sans-serif",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            background: "#fff",
            border: "1px solid #dbe3ec",
            borderRadius: 18,
            padding: 28,
            boxShadow: "0 20px 45px -25px rgba(11,25,38,.45)",
            margin: 20,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: "#fff1f2",
              color: "#e11d48",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AlertIcon />
          </div>
          <h1 style={{ fontSize: 19, margin: "14px 0 8px" }}>Sistema temporariamente indisponível</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569", margin: 0 }}>
            Não foi possível renderizar o sistema de ponto. Verifique a conexão com o banco de dados
            (variável <code>DATABASE_URL</code>) e tente novamente.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
              Código do erro: <strong>{error.digest}</strong>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 18,
              height: 42,
              padding: "0 18px",
              borderRadius: 12,
              border: 0,
              background: "#2b5780",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
