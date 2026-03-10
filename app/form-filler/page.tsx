import Link from "next/link";

export default function FormFillerPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-black">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
        <div className="text-xs uppercase tracking-[0.24em] text-gray-500 font-semibold">Submission Layer</div>
        <h1 className="text-3xl font-semibold tracking-tight">ATS Form Filler</h1>
        <p className="text-sm leading-7 text-gray-700">
          This surface is reserved for the later phase where we automate ATS form completion. The current implementation covers job ingestion, ATS package generation, approval, and inbox-based learning.
        </p>
        <div className="flex gap-3">
          <Link href="/jobs" className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Open Jobs</Link>
          <Link href="/applications" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">Open Applications</Link>
        </div>
      </div>
    </div>
  );
}
