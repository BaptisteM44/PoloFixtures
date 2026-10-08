/**
 * Texte d'une notification (titre, sous-titre, lien) dans la langue du
 * traducteur fourni. Partagé : la cloche (client) et les notifications push
 * (serveur, dans la langue de chaque appareil) disent exactement la même chose.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NotifTranslator = (key: any, values?: any) => string;
export type NotifLike = { type: string; payload: Record<string, string> };

export function notifLabel(t: NotifTranslator, n: NotifLike): { title: string; sub: string; href: string } {
  const p = n.payload;
  switch (n.type) {
    case "SQUAD_INVITE":
      return { title: t("squad_invite", { squadName: p.squadName }), sub: t("squad_invite_from", { name: p.invitedByName }), href: "/my-teams" };
    case "SQUAD_INVITE_ACCEPTED":
      return { title: t("squad_invite_accepted", { name: p.playerName, squadName: p.squadName }), sub: "", href: `/my-teams/${p.squadId}` };
    case "SQUAD_INVITE_DECLINED":
      return { title: t("squad_invite_declined", { name: p.playerName }), sub: t("squad_invite_declined_sub", { squadName: p.squadName }), href: `/my-teams/${p.squadId}` };
    case "SQUAD_ROLE_CHANGED":
      return { title: t("squad_role_changed"), sub: t("squad_role_changed_sub", { squadName: p.squadName ?? "" }), href: `/my-teams/${p.squadId}` };
    case "DIRECT_MESSAGE_REQUEST":
      return { title: t("direct_message_request", { name: p.senderName }), sub: p.preview ?? "", href: "/messages" };
    case "DIRECT_MESSAGE_RECEIVED":
      return { title: t("direct_message_received", { name: p.senderName }), sub: p.preview ?? "", href: "/messages" };
    case "TEAM_REGISTERED":
      return { title: t("team_registered", { teamName: p.teamName }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
    case "TEAM_SELECTED":
      return { title: t("team_selected", { teamName: p.teamName }), sub: t("team_selected_sub", { tournamentName: p.tournamentName ?? "" }), href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
    case "TEAM_WAITLISTED":
      return { title: t("team_waitlisted", { teamName: p.teamName, rank: p.rank }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
    case "BADGE_UNLOCKED":
      return Number(p.count) > 1
        ? { title: t("badges_unlocked_grouped", { count: Number(p.count) }), sub: t("badge_unlocked_last", { badgeName: p.badgeName ?? "" }), href: "/account" }
        : { title: t("badge_unlocked", { badgeName: p.badgeName }), sub: t("badge_unlocked_sub"), href: "/account" };
    case "TEAM_MESSAGE_RECEIVED":
      return { title: t("team_message", { teamName: p.teamName }), sub: p.preview ?? "", href: "/my-tournaments" };
    case "CLUB_JOIN_REQUEST":
      return { title: t("club_join_request", { name: p.playerName }), sub: t("club_join_request_sub", { clubName: p.clubName }), href: `/player/${p.playerSlug}` };
    case "CLUB_SESSION":
      return { title: p.message ?? t("club_session"), sub: "", href: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs" };
    case "CLUB_SESSION_JOIN":
      return { title: p.message ?? t("club_session_join"), sub: "", href: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs" };
    case "CLUB_ANNOUNCEMENT":
      return { title: t("club_announcement", { clubName: p.clubName }), sub: p.announcementTitle ?? "", href: p.clubId ? `/club/${p.clubId}?tab=announcements` : "/clubs" };
    case "TEAM_FEE_CONFIRMED":
      return { title: t("team_fee_confirmed", { teamName: p.teamName }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}` };
    case "COMMUNITY_STATUS_CHANGED": {
      // Les réponses (status "reply") sont traduites à l'affichage selon la
      // langue du lecteur, avec regroupement (count) et distinction
      // auteur/participant. Les autres statuts (planned/done…) gardent le
      // message figé stocké dans le payload.
      if (p.status === "reply") {
        const count = Number(p.count) || 1;
        const grouped = count > 1;
        const participant = p.isParticipant === "true";
        const key = participant
          ? (grouped ? "community_reply_participant_grouped" : "community_reply_participant")
          : (grouped ? "community_reply_grouped" : "community_reply");
        return { title: t(key, { itemTitle: p.itemTitle ?? "", count }), sub: p.itemTitle ?? "", href: p.itemId ? `/labs?id=${p.itemId}` : "/labs" };
      }
      return { title: p.message || t("community_reply", { itemTitle: p.itemTitle ?? "" }), sub: p.itemTitle ?? "", href: p.itemId ? `/labs?id=${p.itemId}` : "/labs" };
    }
    case "ACCOMMODATION_ASSIGNED":
      return { title: t("accommodation_assigned", { hostName: p.hostName ?? "" }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement` };
    case "ACCOMMODATION_GUEST_ADDED":
      return { title: t("accommodation_guest_added"), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement` };
    case "TOURNAMENT_NEEDS_APPROVAL":
      return { title: t("tournament_needs_approval"), sub: p.tournamentName ?? "", href: "/admin" };
    case "CLUB_NEEDS_APPROVAL":
      return { title: t("club_needs_approval"), sub: p.clubName ?? "", href: "/admin" };
    case "NEW_TOURNAMENT_PUBLISHED":
      return { title: t("new_tournament_published", { tournamentName: p.tournamentName ?? "" }), sub: `${p.city ?? ""}${p.country ? ", " + p.country : ""}`, href: `/tournament/${p.tournamentSlug || p.tournamentId}` };
    case "POLL_REPORTED":
      return { title: t("poll_reported"), sub: p.pollQuestion ?? "", href: "/admin/polls" };
    case "POLL_BLOCKED":
      return { title: t("poll_blocked"), sub: p.pollQuestion ?? "", href: "/polls" };
    case "MATCH_SOON": {
      const where = p.court ? ` — ${p.court}` : "";
      const after = Number(p.next) && p.afterLabel ? ` · ${t("after_match", { match: p.afterLabel })}` : "";
      return { title: Number(p.next) ? t("match_next", { where }) : t("match_soon", { time: p.time ?? "", where }), sub: `vs ${p.opponent ?? ""}${after} · ${p.tournamentName ?? ""}`, href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=schedule` };
    }
    case "REFEREE_SOON": {
      const where = p.court ? ` — ${p.court}` : "";
      const after = Number(p.next) && p.afterLabel ? ` · ${t("after_match", { match: p.afterLabel })}` : "";
      return { title: Number(p.next) ? t("referee_next", { where }) : t("referee_soon", { time: p.time ?? "", where }), sub: `${p.matchLabel ?? ""}${after} · ${p.tournamentName ?? ""}`, href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=referees` };
    }
    case "REFEREE_ASSIGNED":
      return {
        title: Number(p.count) ? t("referee_assigned", { team: p.teamName ?? "", count: Number(p.count) }) : t("referee_assigned_none", { team: p.teamName ?? "" }),
        sub: `${p.nextLabel ? `${t("referee_assigned_next", { match: p.nextLabel, time: p.nextTime ?? "" })} · ` : ""}${p.tournamentName ?? ""}`,
        href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=referees`,
      };
    case "POLL_OPENED":
      return { title: t("poll_opened"), sub: p.pollQuestion ?? "", href: `/poll/${p.pollId}` };
    case "POLL_APPROVAL_REQUESTED":
      return { title: t("poll_approval_requested", { name: p.requesterName ?? "", target: p.target || "—" }), sub: p.pollQuestion ?? "", href: "/polls#approvals" };
    case "POLL_APPROVAL_DECIDED":
      return {
        title: t(p.approved === "1" ? "poll_approval_accepted" : "poll_approval_rejected", { target: p.target === "*" ? t("poll_target_everyone") : (p.target ?? "") }),
        sub: p.reason ? `${p.pollQuestion ?? ""} — ${p.reason}` : (p.pollQuestion ?? ""),
        href: "/polls",
      };
    case "POLL_UNBLOCKED":
      return { title: t("poll_unblocked"), sub: p.pollQuestion ?? "", href: "/polls" };
    case "POLL_REPORT_HANDLED":
      return { title: t(p.outcome === "blocked" ? "poll_report_blocked" : "poll_report_dismissed"), sub: p.pollQuestion ?? "", href: p.outcome === "blocked" ? "/polls" : `/poll/${p.pollId}` };
    case "POLL_RESULTS_AVAILABLE":
      return { title: t("poll_results_available"), sub: p.pollQuestion ?? "", href: `/poll/${p.pollId}` };
    case "POLL_CLOSING_SOON":
      return { title: t("poll_closing_soon"), sub: p.pollQuestion ?? "", href: `/poll/${p.pollId}` };
    case "TOURNAMENT_PHOTOS_REVEALED": // fin de tournoi : galerie à compléter
      return { title: t("gallery_end", { count: Number(p.count) || 0 }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos` };
    case "TOURNAMENT_PHOTOS_REQUESTED":
      return { title: t("gallery_requested", { count: Number(p.count) || 0 }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos` };
    case "TOURNAMENT_PHOTOS_DECIDED": {
      const approved = Number(p.approved) || 0;
      const rejected = Number(p.rejected) || 0;
      return {
        title: approved > 0 ? t("gallery_approved", { count: approved }) : t("gallery_rejected", { count: rejected }),
        sub: p.tournamentName ?? "",
        href: `/tournament/${p.tournamentSlug || p.tournamentId}?tab=photos`,
      };
    }
    case "TOURNAMENT_PHOTO_REPORTED":
      return { title: t(p.autoHidden === "1" ? "photo_reported_hidden" : "photo_reported", { name: p.authorName ?? "" }), sub: p.tournamentName ?? "", href: "/admin/photos" };
    case "POLL_VOTE_MILESTONE":
      return { title: t("poll_vote_milestone", { count: Number(p.count) || 0 }), sub: p.pollQuestion ?? "", href: `/poll/${p.pollId}/results` };
    case "PLAYER_MERGE_REQUESTED":
      return { title: t("merge_requested", { name: p.requesterName ?? "", ghost: p.ghostName ?? "" }), sub: t("merge_requested_sub"), href: "/merge-requests" };
    case "PLAYER_MERGE_DECIDED":
      return p.decision === "approved"
        ? { title: t("merge_approved", { ghost: p.ghostName ?? "" }), sub: "", href: `/player/${p.requesterSlug}` }
        : { title: t("merge_rejected", { ghost: p.ghostName ?? "" }), sub: "", href: "/account" };
    default:
      return { title: t("default"), sub: "", href: "/my-teams" };
  }
}
