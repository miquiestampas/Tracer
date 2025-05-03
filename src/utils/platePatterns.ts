export const platePatterns = {
  // Europa Occidental y del Sur
  ES: { name: 'España', regex: /^[0-9]{4}[A-Z]{3}$/, example: '1234ABC' },
  PT: { name: 'Portugal', regex: /^[0-9]{2}-[0-9]{2}-[A-Z]{2}$/, example: '12-34-AB' },
  FR: { name: 'Francia', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'AB-123-CD' },
  IT: { name: 'Italia', regex: /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/, example: 'AB123CD' },
  BE: { name: 'Bélgica', regex: /^[1-9]-[A-Z]{3}-[0-9]{3}$/, example: '1-ABC-234' },
  NL: { name: 'Países Bajos', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{1,2}$/, example: 'AB-123-C' },
  LU: { name: 'Luxemburgo', regex: /^[0-9]{4,6}$/, example: '12345' },
  MC: { name: 'Mónaco', regex: /^\d{2,5} [A-Z]{2}$/, example: '1234 MC' },

  // Europa Central
  DE: { name: 'Alemania', regex: /^[A-Z]{1,3}-[A-Z]{1,2} [0-9]{1,4}$/, example: 'B-AB 1234' },
  AT: { name: 'Austria', regex: /^[A-Z]{1,2}-[0-9]{1,5}-[A-Z]{1,2}$/, example: 'W-12345A' },
  CH: { name: 'Suiza', regex: /^[A-Z]{2} [0-9]{1,6}$/, example: 'ZH 123456' },
  PL: { name: 'Polonia', regex: /^[A-Z]{2,3} [0-9A-Z]{4,5}$/, example: 'PO 12345' },
  CZ: { name: 'Chequia', regex: /^[0-9]{1,2}[A-Z]{1,2} [0-9]{4,5}$/, example: '1AB 2345' },
  SK: { name: 'Eslovaquia', regex: /^[A-Z]{2} [0-9]{3}[A-Z]{2}$/, example: 'BA 123AB' },
  HU: { name: 'Hungría', regex: /^[A-Z]{3}-[0-9]{3}$/, example: 'ABC-123' },
  SI: { name: 'Eslovenia', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{1,2}$/, example: 'LJ-123-A' },
  HR: { name: 'Croacia', regex: /^[A-Z]{2}-[0-9]{3,4}-[A-Z]{2}$/, example: 'ZG-1234-AB' },
  RS: { name: 'Serbia', regex: /^[A-Z]{2} [0-9]{3}-[A-Z]{2}$/, example: 'BG 123-AB' },
  RO: { name: 'Rumanía', regex: /^[A-Z]{1,2}-[0-9]{2,3}-[A-Z]{3}$/, example: 'B-123-ABC' },
  BG: { name: 'Bulgaria', regex: /^[A-Z]{1,2} [0-9]{4} [A-Z]{1,2}$/, example: 'CA 1234 AB' },
  UA: { name: 'Ucrania', regex: /^[A-Z]{2} [0-9]{4} [A-Z]{2}$/, example: 'AA 1234 BB' },
  BY: { name: 'Bielorrusia', regex: /^[0-9]{4} [A-Z]{2}-[1-7]$/, example: '1234 AB-7' },

  // Europa del Norte y Este
  LT: { name: 'Lituania', regex: /^[A-Z]{3} [0-9]{3}$/, example: 'ABC 123' },
  LV: { name: 'Letonia', regex: /^[A-Z]{2}-[0-9]{4}$/, example: 'AB-1234' },
  EE: { name: 'Estonia', regex: /^[0-9]{3}[A-Z]{3}$/, example: '123ABC' },
  FI: { name: 'Finlandia', regex: /^[A-Z]{2,3}-[0-9]{1,3}$/, example: 'ABC-123' },
  SE: { name: 'Suecia', regex: /^[A-Z]{3} [0-9]{2}[A-Z0-9]$/, example: 'ABC 12A' },
  NO: { name: 'Noruega', regex: /^[A-Z]{2} [0-9]{5,6}$/, example: 'AB 12345' },
  DK: { name: 'Dinamarca', regex: /^[A-Z]{2} [0-9]{5}$/, example: 'AB 12345' },

  // Europa del Oeste y UK
  GB: { name: 'Reino Unido', regex: /^[A-Z]{2}[0-9]{2} [A-Z]{3}$/, example: 'AB12 CDE' },
  IE: { name: 'Irlanda', regex: /^[0-9]{2,3}-[A-Z]{1,2}-[0-9]{1,6}$/, example: '12-D-12345' },

  // Países Bálticos y Balcanes
  AL: { name: 'Albania', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'AA-123-AA' },
  MK: { name: 'Macedonia', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'SK-123-AB' },
  ME: { name: 'Montenegro', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'PG-123-AB' },
  BA: { name: 'Bosnia y Herzegovina', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'MO-123-AA' },
  GR: { name: 'Grecia', regex: /^[A-Z]{3}-[0-9]{4}$/, example: 'ABC-1234' },
  TR: { name: 'Turquía', regex: /^[0-9]{2} [A-Z]{1,3} [0-9]{2,4}$/, example: '34 ABC 1234' },

  // Rusia y ex-URSS
  RU: { name: 'Rusia', regex: /^[A-Z]{1}[0-9]{3}[A-Z]{2} [0-9]{2,3}$/, example: 'A123BC 77' },
  KZ: { name: 'Kazajistán', regex: /^[0-9]{3}[A-Z]{2}[0-9]{2}$/, example: '123AB45' },
  GE: { name: 'Georgia', regex: /^[A-Z]{2}-[0-9]{3}-[A-Z]{2}$/, example: 'AB-123-CD' },
  AM: { name: 'Armenia', regex: /^[0-9]{2} [A-Z]{2} [0-9]{3}$/, example: '12 AB 123' },
  AZ: { name: 'Azerbaiyán', regex: /^[0-9]{2}-[A-Z]{2}-[0-9]{3}$/, example: '10-AA-123' },

  // Norte de África
  MA: { name: 'Marruecos', regex: /^[0-9]{1,5}-[A-Z]{1,2}-[0-9]{2}$/, example: '12345-A-12' },
  DZ: { name: 'Argelia', regex: /^[0-9]{5,6}-[0-9]{2}-[0-9]{2}$/, example: '123456-12-34' },
  TN: { name: 'Túnez', regex: /^[0-9]{1,4} تونس [0-9]{1,4}$/, example: '1234 تونس 5678' },
  LY: { name: 'Libia', regex: /^[0-9]{1,7}$/, example: '1234567' }
}; 