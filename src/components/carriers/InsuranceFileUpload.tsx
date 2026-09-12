'use client';

import FileUploadField from '@/components/FileUploadField';

/**
 * The carrier's certificate of insurance.
 *
 * Kept under its own `carrier-insurance/` prefix rather than beside the order
 * paperwork, because it belongs to the carrier and not to any one load: a
 * certificate uploaded while booking Tuesday's load is the same document that
 * answers Friday's. The prefix is readable by any allowlisted account except an
 * intern, matching who may open Carriers at all — see storage.rules.
 */
export default function InsuranceFileUpload({
  carrierId,
  value,
  onChange,
  readOnly,
}: {
  /** null on the add forms, where the carrier does not exist yet. */
  carrierId: string | null;
  value: string | null;
  onChange: (storagePath: string | null) => void;
  readOnly?: boolean;
}) {
  return (
    <FileUploadField
      storagePrefix="carrier-insurance"
      recordId={carrierId}
      value={value}
      onChange={onChange}
      uploadLabel="Upload Certificate"
      viewLabel="View Certificate"
      readOnly={readOnly}
    />
  );
}
