/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: lib/visual/story-world/story-world.ts
 * Step: 7 of 15 (Story World Extractor — Contextual Role & Age Hydration)
 * Status: PRODUCTION-READY (LOCKED)
 * ========================================================================================
 * Memproses teks naskah menjadi fakta terstruktur (ExtractedFactPayload) dan
 * meng-inferensi Usia Karakter (Age Tier) & Peran secara otomatis berbasis konteks naskah.
 * ========================================================================================
 */

import {
  ShotId,
  CharacterId,
  ObjectId,
  EnvId,
  ExtractedFactPayload,
  ExtractionConfidence,
  CharacterRoleType,
  CharacterAgeTier,
  FactHydrationTier,
  createCharacterId,
  createObjectId,
  createEnvId
} from '../domain-model';

export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.80;

export interface FactHydrationOutputDTO<T> {
  readonly factKey: string;
  readonly hydratedValue: T;
  readonly tier: FactHydrationTier;
  readonly confidence: ExtractionConfidence;
}

export interface UnparsedFactInput {
  readonly shotId: ShotId;
  readonly scriptText: string;
  readonly rawCharacterNames?: ReadonlyArray<string>;
  readonly rawObjectNames?: ReadonlyArray<string>;
  readonly rawEnvironmentText?: string;
  readonly rawConfidenceScore?: number;
}

/**
 * Story World Fact Extractor & Contextual Hydrator Engine
 */
export class StoryWorldExtractor {
  /**
   * Ekstraksi teks naskah menjadi ExtractedFactPayload dengan otomatisasi Age Tier & Role.
   */
  public extractAndHydrateFacts(input: UnparsedFactInput): ExtractedFactPayload {
    const rawScore = input.rawConfidenceScore ?? 0.85;
    const confidence: ExtractionConfidence = Math.min(Math.max(rawScore, 0.0), 1.0);

    const textLower = input.scriptText.toLowerCase();

    // 1. Character Fact Extraction & Automatic Contextual Hydration
    const characters: Array<Readonly<{
      id: CharacterId;
      name: string;
      roleType: CharacterRoleType;
      ageTier: CharacterAgeTier;
      action: 'UNKNOWN' | 'Present in scene';
    }>> = (input.rawCharacterNames ?? []).map((name, index) => {
      const isExplicit = textLower.includes(name.toLowerCase());
      const roleType = this.inferRoleTypeFromContext(name, textLower);
      const ageTier = this.inferAgeTierFromContext(name, textLower);

      return Object.freeze({
        id: createCharacterId(`char-${index + 1}`),
        name,
        roleType,
        ageTier,
        action: isExplicit ? ('Present in scene' as const) : ('UNKNOWN' as const)
      });
    });

    // Jika tidak ada karakter yang terdeteksi, buat default Everyman Subject dengan Contextual Age
    if (characters.length === 0) {
      const fallbackAgeTier = this.inferAgeTierFromContext('subject', textLower);
      characters.push(
        Object.freeze({
          id: createCharacterId('char-main'),
          name: 'Everyman Subject',
          roleType: 'GENERIC_EVERYMAN' as const,
          ageTier: fallbackAgeTier,
          action: 'Present in scene' as const
        })
      );
    }

    // 2. Object Fact Extraction
    const objects = (input.rawObjectNames ?? []).map((name, index) => {
      const isExplicit = textLower.includes(name.toLowerCase());
      return Object.freeze({
        id: createObjectId(`obj-${index + 1}`),
        name,
        action: isExplicit ? ('Interacted in scene' as const) : ('UNKNOWN' as const)
      });
    });

    // 3. Environment Fact Extraction
    const envDesc = input.rawEnvironmentText && input.rawEnvironmentText.trim().length > 0
      ? input.rawEnvironmentText
      : 'UNKNOWN';

    const environment = Object.freeze({
      id: createEnvId('env-main'),
      description: envDesc
    });

    return Object.freeze({
      characters: Object.freeze(characters),
      objects: Object.freeze(objects),
      environment,
      confidence
    });
  }

  /**
   * Logika Otomatis Inferensi Age Tier Berdasarkan Peran & Konteks Naskah
   */
  public inferAgeTierFromContext(characterName: string, scriptTextLower: string): CharacterAgeTier {
    const elderlyKeywords = ['kakek', 'lansia', 'tua', 'veteran', 'monarki tua', 'old man', 'elderly'];
    if (elderlyKeywords.some((kw) => scriptTextLower.includes(kw) || characterName.toLowerCase().includes(kw))) {
      return 'ELDERLY';
    }

    const childKeywords = ['anak', 'bocah', 'kecil', 'pelajar', 'murid', 'child', 'kid'];
    if (childKeywords.some((kw) => scriptTextLower.includes(kw) || characterName.toLowerCase().includes(kw))) {
      return 'CHILD';
    }

    const middleAgedKeywords = [
      'raja', 'king', 'presiden', 'bapak', 'pejabat', 'menteri', 'komandan',
      'pemimpin', 'direktur', 'pemilik', 'owner', 'ilmuwan senior', 'profesor', 'knocker-up'
    ];
    if (middleAgedKeywords.some((kw) => scriptTextLower.includes(kw) || characterName.toLowerCase().includes(kw))) {
      return 'MIDDLE_AGED';
    }

    return 'ADULT';
  }

  /**
   * Inferensi Peran Karakter (Everyman vs Historical Figure)
   */
  public inferRoleTypeFromContext(characterName: string, scriptTextLower: string): CharacterRoleType {
    const historicalKeywords = ['edison', 'einstein', 'napoleon', 'soekarno', 'lincoln', 'tesla', 'newton'];
    const nameLower = characterName.toLowerCase();

    if (historicalKeywords.some((kw) => nameLower.includes(kw) || scriptTextLower.includes(kw))) {
      return 'HISTORICAL_FIGURE';
    }

    return 'GENERIC_EVERYMAN';
  }

  /**
   * Mengkonversi nilai variabel individual ke dalam FactValue dengan provenance tier.
   */
  public hydrateSingleFact<T>(
    key: string,
    rawTextValue: string | undefined | null,
    systemDefaultFallback: T
  ): FactHydrationOutputDTO<T> {
    if (rawTextValue && rawTextValue.trim().length > 0) {
      return Object.freeze({
        factKey: key,
        hydratedValue: rawTextValue as unknown as T,
        tier: 'EXPLICIT_TEXT',
        confidence: 1.0
      });
    }

    if (systemDefaultFallback !== undefined && systemDefaultFallback !== null) {
      return Object.freeze({
        factKey: key,
        hydratedValue: systemDefaultFallback,
        tier: 'SYSTEM_HYDRATED',
        confidence: 0.85
      });
    }

    return Object.freeze({
      factKey: key,
      hydratedValue: 'UNKNOWN' as unknown as T,
      tier: 'UNKNOWN',
      confidence: 0.0
    });
  }

  /**
   * Memeriksa apakah skor confidence memenuhi ambang batas Gate 1 (>= 0.80)
   */
  public meetsGate1ConfidenceThreshold(confidence: ExtractionConfidence): boolean {
    return confidence >= EXTRACTION_CONFIDENCE_THRESHOLD;
  }
}
