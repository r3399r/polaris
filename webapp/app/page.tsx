export default function Page() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">polaris</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Back-office and observability for celestialstudio. Nothing is wired up
        yet — this page exists to prove the S3 export, the CloudFront
        distribution and the Route53 record are serving correctly.
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Next: an API for the backend to answer on, then the dashboard.
      </p>
    </main>
  );
}
