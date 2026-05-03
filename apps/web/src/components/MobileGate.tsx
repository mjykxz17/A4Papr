'use client';

export function MobileGate() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">View on desktop to edit</h1>
        <p className="text-sm text-slate-600">
          A4 Papr uses drag-and-drop on a precision A4 canvas. Open this page on a desktop
          browser to build your cheatsheet.
        </p>
      </div>
    </div>
  );
}
