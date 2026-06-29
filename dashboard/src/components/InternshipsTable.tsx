// src/dashboard/src/components/InternshipsTable.tsx
import React from "react";

export default function InternshipsTable({ jobs }: { jobs: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Title</th>
            <th className="p-2 text-left">Company</th>
            <th className="p-2 text-left">Recorded At</th>
            <th className="p-2 text-left">Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="p-2">{job.title}</td>
              <td className="p-2">{job.company}</td>
              <td className="p-2">{job.internshipRecordedAt || "-"}</td>
              <td className="p-2">
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Open
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
