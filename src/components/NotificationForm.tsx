"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveNotificationPreferences } from "@/app/[locale]/settings/actions";

const GEO = [
  { continent: "EU", label: "Europe", flag: "🌍", countries: [
    { code: "FR", label: "France" }, { code: "DE", label: "Allemagne/Germany" },
    { code: "GB", label: "UK" }, { code: "ES", label: "Espagne/Spain" },
    { code: "IT", label: "Italie/Italy" }, { code: "NL", label: "Pays-Bas/Netherlands" },
    { code: "BE", label: "Belgique/Belgium" }, { code: "CH", label: "Suisse/Switzerland" },
    { code: "AT", label: "Autriche/Austria" }, { code: "PL", label: "Pologne/Poland" },
    { code: "CZ", label: "Tchéquie/Czechia" }, { code: "SE", label: "Suède/Sweden" },
    { code: "NO", label: "Norvège/Norway" }, { code: "DK", label: "Danemark/Denmark" },
    { code: "FI", label: "Finlande/Finland" }, { code: "PT", label: "Portugal" },
    { code: "HR", label: "Croatie/Croatia" }, { code: "HU", label: "Hongrie/Hungary" },
    { code: "RO", label: "Roumanie/Romania" }, { code: "SK", label: "Slovaquie/Slovakia" },
    { code: "SI", label: "Slovénie/Slovenia" }, { code: "RS", label: "Serbie/Serbia" },
    { code: "GR", label: "Grèce/Greece" }, { code: "IE", label: "Irlande/Ireland" },
    { code: "LV", label: "Lettonie/Latvia" }, { code: "LT", label: "Lituanie/Lithuania" },
    { code: "EE", label: "Estonie/Estonia" }, { code: "UA", label: "Ukraine" },
    { code: "IS", label: "Islande/Iceland" },
  ]},
  { continent: "AM", label: "Amériques", flag: "🌎", countries: [
    { code: "US", label: "États-Unis/USA" }, { code: "CA", label: "Canada" },
    { code: "MX", label: "Mexique/Mexico" }, { code: "BR", label: "Brésil/Brazil" },
    { code: "AR", label: "Argentine/Argentina" }, { code: "CL", label: "Chili/Chile" },
    { code: "CO", label: "Colombie/Colombia" }, { code: "PE", label: "Pérou/Peru" },
    { code: "UY", label: "Uruguay" }, { code: "EC", label: "Équateur/Ecuador" },
    { code: "VE", label: "Venezuela" }, { code: "BO", label: "Bolivie/Bolivia" },
    { code: "PY", label: "Paraguay" }, { code: "GT", label: "Guatemala" },
    { code: "CR", label: "Costa Rica" }, { code: "CU", label: "Cuba" },
  ]},
  { continent: "AP", label: "Asie-Pacifique", flag: "🌏", countries: [
    { code: "AU", label: "Australie/Australia" }, { code: "NZ", label: "Nouvelle-Zélande/New Zealand" },
    { code: "JP", label: "Japon/Japan" }, { code: "KR", label: "Corée du Sud/South Korea" },
    { code: "TW", label: "Taïwan/Taiwan" }, { code: "TH", label: "Thaïlande/Thailand" },
    { code: "SG", label: "Singapour/Singapore" }, { code: "IN", label: "Inde/India" },
    { code: "PH", label: "Philippines" }, { code: "ID", label: "Indonésie/Indonesia" },
    { code: "MY", label: "Malaisie/Malaysia" }, { code: "HK", label: "Hong Kong" },
    { code: "CN", label: "Chine/China" },
  ]},
  { continent: "AF", label: "Afrique & Moyen-Orient", flag: "🌍", countries: [
    { code: "ZA", label: "Afrique du Sud/South Africa" }, { code: "MA", label: "Maroc/Morocco" },
    { code: "EG", label: "Égypte/Egypt" }, { code: "KE", label: "Kenya" },
    { code: "NG", label: "Nigeria" }, { code: "GH", label: "Ghana" },
    { code: "TN", label: "Tunisie/Tunisia" }, { code: "IL", label: "Israël/Israel" },
    { code: "TR", label: "Turquie/Turkey" },
  ]},
];

interface Props {
  initialEnabled: boolean;
  initialContinents: string[];
  initialCountries: string[];
}

export function NotificationForm({ initialEnabled, initialContinents, initialCountries }: Props) {
  const t = useTranslations("settings_notifications");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selectedContinents, setSelectedContinents] = useState<Set<string>>(new Set(initialContinents));
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set(initialCountries));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggleContinent(continent: string, countries: { code: string }[]) {
    const allSelected = countries.every((c) => selectedCountries.has(c.code));
    const newContinents = new Set(selectedContinents);
    const newCountries = new Set(selectedCountries);

    if (allSelected) {
      newContinents.delete(continent);
      countries.forEach((c) => newCountries.delete(c.code));
    } else {
      newContinents.add(continent);
      countries.forEach((c) => newCountries.add(c.code));
    }

    setSelectedContinents(newContinents);
    setSelectedCountries(newCountries);
  }

  function toggleCountry(code: string, continent: string, countries: { code: string }[]) {
    const newCountries = new Set(selectedCountries);
    const newContinents = new Set(selectedContinents);

    if (newCountries.has(code)) {
      newCountries.delete(code);
      newContinents.delete(continent);
    } else {
      newCountries.add(code);
      if (countries.every((c) => newCountries.has(c.code))) {
        newContinents.add(continent);
      }
    }

    setSelectedCountries(newCountries);
    setSelectedContinents(newContinents);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    if (enabled) formData.set("enabled", "on");
    selectedContinents.forEach((c) => formData.append("continents", c));
    selectedCountries.forEach((c) => formData.append("countries", c));

    startTransition(async () => {
      await saveNotificationPreferences(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="settings-form">
      <div className="settings-toggle-row">
        <label className="settings-toggle-label">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{t("enable_notifications")}</span>
        </label>
      </div>

      {enabled && (
        <div className="settings-geo">
          <h3 className="settings-section-title">{t("geo_zones")}</h3>
          <p className="settings-hint">{t("geo_hint")}</p>

          {GEO.map(({ continent, label, flag, countries }) => {
            const allChecked = countries.every((c) => selectedCountries.has(c.code));
            const someChecked = countries.some((c) => selectedCountries.has(c.code));

            return (
              <div key={continent} className="settings-continent">
                <label className="settings-continent-label">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked;
                    }}
                    onChange={() => toggleContinent(continent, countries)}
                  />
                  <span>{flag} {t("all_continent", { label })}</span>
                </label>
                <div className="settings-countries">
                  {countries.map(({ code, label: countryLabel }) => (
                    <label key={code} className="settings-country-label">
                      <input
                        type="checkbox"
                        checked={selectedCountries.has(code)}
                        onChange={() => toggleCountry(code, continent, countries)}
                      />
                      <span>{countryLabel}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="settings-form-footer">
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </button>
        {saved && <span className="settings-saved">{t("saved")}</span>}
      </div>
    </form>
  );
}
