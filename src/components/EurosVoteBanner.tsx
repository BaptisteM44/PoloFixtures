"use client";

import { useTranslations } from "next-intl";

const DISCUSSION_URL = "https://poloverse.net/t/towards-a-mixed-gender-euros/4797/31";

export function EurosVoteBanner() {
  const t = useTranslations("home");

  return (
    <a
      href={DISCUSSION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="euros-vote-banner"
    >
      <span className="euros-vote-banner__icon" aria-hidden>🗳️</span>
      <span className="euros-vote-banner__text">
        <strong>{t("euros_vote_title")}</strong> {t("euros_vote_body")}
      </span>
      <span className="euros-vote-banner__cta">{t("euros_vote_cta")} →</span>
    </a>
  );
}
