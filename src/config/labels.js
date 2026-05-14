/**
 * Short labels for factors and subfactors.
 *
 * Two sets:
 *   - FACTOR_TITLES: full editorial titles for headers (e.g. "1. Constraints on Government Powers")
 *   - SUBFACTOR_SHORT_LABELS: condensed subfactor names. The full WJP names are
 *     long sentences ("Government powers are effectively limited by the legislature");
 *     these short versions match the visual style of the WJP ROLI report and
 *     fit the chart layout. Numbered prefixes are preserved so readers can
 *     cross-reference with the WJP publication.
 */
export const FACTOR_TITLES = {
  f1: '1. Constraints on Government Powers',
  f2: '2. Absence of Corruption',
  f3: '3. Open Government',
  f4: '4. Fundamental Rights',
  f5: '5. Order and Security',
  f6: '6. Regulatory Enforcement',
  f7: '7. Civil Justice',
  f8: '8. Criminal Justice',
};

export const SUBFACTOR_SHORT_LABELS = {
  // Factor 1 — Constraints on Government Powers
  sf11: '1.1 Limited by legislature',
  sf12: '1.2 Limited by judiciary',
  sf13: '1.3 Limited by auditing and review',
  sf14: '1.4 Officials sanctioned for misconduct',
  sf15: '1.5 Non-governmental checks',
  sf16: '1.6 Transition of power',
  // Factor 2 — Absence of Corruption
  sf21: '2.1 Executive branch',
  sf22: '2.2 Judicial branch',
  sf23: '2.3 Police and military',
  sf24: '2.4 Legislative branch',
  // Factor 3 — Open Government
  sf31: '3.1 Publicized laws and government data',
  sf32: '3.2 Right to information',
  sf33: '3.3 Civic participation',
  sf34: '3.4 Complaint mechanisms',
  // Factor 4 — Fundamental Rights
  sf41: '4.1 Equal treatment and absence of discrimination',
  sf42: '4.2 Right to life and security',
  sf43: '4.3 Due process and rights of the accused',
  sf44: '4.4 Freedom of opinion and expression',
  sf45: '4.5 Freedom of belief and religion',
  sf46: '4.6 Freedom from interference with privacy',
  sf47: '4.7 Freedom of assembly and association',
  sf48: '4.8 Fundamental labor rights',
  // Factor 5 — Order and Security
  sf51: '5.1 Crime is effectively controlled',
  sf52: '5.2 Civil conflict is effectively limited',
  sf53: '5.3 No violence to redress grievances',
  // Factor 6 — Regulatory Enforcement
  sf61: '6.1 Regulations effectively enforced',
  sf62: '6.2 No improper influence',
  sf63: '6.3 No unreasonable delay',
  sf64: '6.4 Due process in administrative proceedings',
  sf65: '6.5 No expropriation without due process',
  // Factor 7 — Civil Justice
  sf71: '7.1 Access and afford civil justice',
  sf72: '7.2 Free of discrimination',
  sf73: '7.3 Free of corruption',
  sf74: '7.4 Free of improper government influence',
  sf75: '7.5 No unreasonable delay',
  sf76: '7.6 Effectively enforced',
  sf77: '7.7 Alternative dispute resolution',
  // Factor 8 — Criminal Justice
  sf81: '8.1 Investigation system is effective',
  sf82: '8.2 Adjudication is timely and effective',
  sf83: '8.3 Correctional system is effective',
  sf84: '8.4 Criminal system is impartial',
  sf85: '8.5 Free of corruption',
  sf86: '8.6 Free of improper government influence',
  sf87: '8.7 Due process and rights of the accused',
};
