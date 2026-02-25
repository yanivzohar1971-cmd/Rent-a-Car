/**
 * Map CKAN (data.gov.il) vehicle record to our gov.mapped shape.
 * Field names from Israel MoT dataset (e.g. mispar_rechev = vehicle number).
 */
export interface GovMappedRecord {
  plate?: string | null;
  manufacturerCode?: string | number | null;
  manufacturerName?: string | null;
  modelCode?: string | number | null;
  modelNumber?: string | null;
  modelType?: string | null;
  commercialName?: string | null;
  trimLevel?: string | null;
  safetyLevel?: string | null;
  pollutionGroup?: string | null;
  year?: number | null;
  ownership?: string | null;
  licenseValidUntil?: string | null;
  lastTestDate?: string | null;
  color?: string | null;
}

export interface CkanVehicleRecord {
  mispar_rechev?: string | number | null;
  tozeret_cd?: string | number | null;
  tozeret_nm?: string | null;
  degem_cd?: string | number | null;
  degem_nm?: string | null;
  sug_degem?: string | null;
  kinuy_mishari?: string | null;
  ramat_gimur?: string | null;
  ramat_eivzur_betihuty?: string | null;
  kvutzat_zihum?: string | null;
  shnat_yitzur?: string | number | null;
  baalut?: string | null;
  tokef_dt?: string | null;
  mivchan_acharon_dt?: string | null;
  tzeva_rechev?: string | null;
  [key: string]: unknown;
}

export function mapCkanToGovMapped(record: CkanVehicleRecord): GovMappedRecord {
  const num = (v: string | number | null | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: string | number | null | undefined): string | null =>
    v != null && String(v).trim() !== '' ? String(v).trim() : null;

  return {
    plate: str(record.mispar_rechev),
    manufacturerCode: num(record.tozeret_cd) ?? str(record.tozeret_cd),
    manufacturerName: str(record.tozeret_nm),
    modelCode: num(record.degem_cd) ?? str(record.degem_cd),
    modelNumber: str(record.degem_nm),
    modelType: str(record.sug_degem),
    commercialName: str(record.kinuy_mishari),
    trimLevel: str(record.ramat_gimur),
    safetyLevel: str(record.ramat_eivzur_betihuty),
    pollutionGroup: str(record.kvutzat_zihum),
    year: num(record.shnat_yitzur),
    ownership: str(record.baalut),
    licenseValidUntil: str(record.tokef_dt),
    lastTestDate: str(record.mivchan_acharon_dt),
    color: str(record.tzeva_rechev),
  };
}
