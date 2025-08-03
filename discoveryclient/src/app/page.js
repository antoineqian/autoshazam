export default function LandingPage() {
  return (
    <main className="text-center py-20">
      <h1 className="text-4xl font-bold mb-4">Welcome to Audio App</h1>
      <p className="mb-6">Sign in to start uploading and exploring tracks.</p>
      <a href="/dashboard" className="underline text-blue-600">
        Go to Dashboard →
      </a>
    </main>
  );
}