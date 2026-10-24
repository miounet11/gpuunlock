import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1>404</h1>
        <p>That page does not exist.</p>
        <Link href="/en">Go to the English home page</Link>
      </body>
    </html>
  );
}
