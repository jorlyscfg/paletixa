function App() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-10 rounded-md bg-slate-950 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <main
        id="main-content"
        className="flex min-h-dvh items-center bg-slate-50 px-5 py-12 text-slate-950 sm:px-8"
      >
        <section aria-labelledby="page-title" className="mx-auto w-full max-w-3xl">
          <h1
            id="page-title"
            className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Project foundation
          </h1>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-700 sm:text-lg">
            The application infrastructure is ready for development.
          </p>
        </section>
      </main>
    </>
  )
}

export default App
