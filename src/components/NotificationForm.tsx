"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveNotificationPreferences } from "@/app/[locale]/settings/actions";

const GEO = [
  { continent: "EU", label: "Europe", flag: "🌍", countries: [
    { code: "AT", label: "Autriche/Austria" }, { code: "BY", label: "Biélorussie/Belarus" },
    { code: "BE", label: "Belgique/Belgium" }, { code: "HR", label: "Croatie/Croatia" },
    { code: "CZ", label: "Tchéquie/Czechia" }, { code: "DK", label: "Danemark/Denmark" },
    { code: "FI", label: "Finlande/Finland" }, { code: "FR", label: "France" },
    { code: "DE", label: "Allemagne/Germany" }, { code: "HU", label: "Hongrie/Hungary" },
    { code: "IE", label: "Irlande/Ireland" }, { code: "IT", label: "Italie/Italy" },
    { code: "LV", label: "Lettonie/Latvia" }, { code: "LT", label: "Lituanie/Lithuania" },
    { code: "NL", label: "Pays-Bas/Netherlands" }, { code: "NO", label: "Norvège/Norway" },
    { code: "PL", label: "Pologne/Poland" }, { code: "PT", label: "Portugal" },
    { code: "RO", label: "Roumanie/Romania" }, { code: "RU", label: "Russie/Russia" },
    { code: "RS", label: "Serbie/Serbia" }, { code: "SK", label: "Slovaquie/Slovakia" },
    { code: "SI", label: "Slovénie/Slovenia" }, { code: "ES", label: "Espagne/Spain" },
    { code: "SE", label: "Suède/Sweden" }, { code: "CH", label: "Suisse/Switzerland" },
    { code: "TR", label: "Turquie/Turkey" }, { code: "UA", label: "Ukraine" },
    { code: "GB", label: "UK" },
  ]},
  { continent: "NA", label: "Amérique du Nord", flag: "🌎", countries: [
    { code: "US", label: "États-Unis/USA" }, { code: "CA", label: "Canada" },
    { code: "MX", label: "Mexique/Mexico" }, { code: "CU", label: "Cuba" },
    { code: "PR", label: "Porto Rico/Puerto Rico" },
  ]},
  { continent: "SA", label: "Amérique du Sud", flag: "🌎", countries: [
    { code: "AR", label: "Argentine/Argentina" }, { code: "BR", label: "Brésil/Brazil" },
    { code: "CL", label: "Chili/Chile" }, { code: "CO", label: "Colombie/Colombia" },
    { code: "EC", label: "Équateur/Ecuador" }, { code: "PE", label: "Pérou/Peru" },
    { code: "UY", label: "Uruguay" },
  ]},
  { continent: "AP", label: "Asie-Pacifique", flag: "🌏", countries: [
    { code: "AU", label: "Australie/Australia" }, { code: "CN", label: "Chine/China" },
    { code: "HK", label: "Hong Kong" }, { code: "JP", label: "Japon/Japan" },
    { code: "MY", label: "Malaisie/Malaysia" }, { code: "NZ", label: "Nouvelle-Zélande/New Zealand" },
    { code: "SG", label: "Singapour/Singapore" }, { code: "TW", label: "Taïwan/Taiwan" },
  ]},
  { continent: "AF", label: "Afrique", flag: "🌍", countries: [
    { code: "EG", label: "Égypte/Egypt" },
  ]},
];

interface Props {
  initialEnabled: boolean;
  initialContinents: string[];
  initialCountries: string[];
  initialNotifyNewTournaments?: boolean;
  initialNotifyFollowedClosing?: boolean;
  initialNotifySquadInvite?: boolean;
}

export function NotificationForm({
  initialEnabled,
  initialContinents,
  initialCountries,
  initialNotifyNewTournaments = true,
  initialNotifyFollowedClosing = true,
  initialNotifySquadInvite = true,
}: Props) {
  const t = useTranslations("settings_notifications");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selectedContinents, setSelectedContinents] = useState<Set<string>>(new Set(initialContinents));
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set(initialCountries));
  const [notifyNewTournaments, setNotifyNewTournaments] = useState(initialNotifyNewTournaments);
  const [notifyFollowedClosing, setNotifyFollowedClosing] = useState(initialNotifyFollowedClosing);
  const [notifySquadInvite, setNotifySquadInvite] = useState(initialNotifySquadInvite);
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
    if (notifyNewTournaments) formData.set("notifyNewTournaments", "on");
    if (notifyFollowedClosing) formData.set("notifyFollowedClosing", "on");
    if (notifySquadInvite) formData.set("notifySquadInvite", "on");

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
        <div className="settings-notif-types" style={{ marginBottom: 24 }}>
          <h3 className="settings-section-title">{t("notif_types_title")}</h3>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label">
              <input
                type="checkbox"
                checked={notifyNewTournaments}
                onChange={(e) => setNotifyNewTournaments(e.target.checked)}
              />
              <span>✉️ {t("notif_new_tournaments")}</span>
            </label>
          </div>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label">
              <input
                type="checkbox"
                checked={notifyFollowedClosing}
                onChange={(e) => setNotifyFollowedClosing(e.target.checked)}
              />
              <span>⭐ {t("notif_followed_closing")}</span>
            </label>
          </div>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label">
              <input
                type="checkbox"
                checked={notifySquadInvite}
                onChange={(e) => setNotifySquadInvite(e.target.checked)}
              />
              <span>👥 {t("notif_squad_invite")}</span>
            </label>
          </div>
        </div>
      )}

      {enabled && notifyNewTournaments && (
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
