from __future__ import annotations

from sqlalchemy.orm import Session

from finnews.models import User, UserPreference
from finnews.schemas.profile import UserPreferenceUpdateRequest


def _as_string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


class ProfileService:
    def get_or_create_preferences(self, db: Session, user: User) -> UserPreference:
        preference = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
        if preference is not None:
            return preference

        preference = UserPreference(user_id=user.id)
        db.add(preference)
        db.commit()
        db.refresh(preference)
        return preference

    def update_preferences(self, db: Session, user: User, payload: UserPreferenceUpdateRequest) -> UserPreference:
        preference = self.get_or_create_preferences(db=db, user=user)

        updates = payload.model_dump(exclude_unset=True)
        if "search_profile_text" in updates:
            preference.search_profile_text = updates["search_profile_text"]
        if "response_style" in updates:
            preference.response_style = updates["response_style"]
        if "interested_assets" in updates:
            preference.interested_assets = _as_string_list(updates["interested_assets"])
        if "interested_regions" in updates:
            preference.interested_regions = _as_string_list(updates["interested_regions"])
        if "interested_topics" in updates:
            preference.interested_topics = _as_string_list(updates["interested_topics"])
        if "notes" in updates:
            preference.notes = updates["notes"]

        db.add(preference)
        db.commit()
        db.refresh(preference)
        return preference

    def build_preference_context(self, preference: UserPreference | None) -> str:
        if preference is None:
            return ""

        lines: list[str] = []
        if preference.search_profile_text:
            lines.append(f"Profil wyszukiwania: {preference.search_profile_text}")
        if preference.response_style:
            lines.append(f"Preferowany styl odpowiedzi: {preference.response_style}")

        assets = _as_string_list(preference.interested_assets)
        if assets:
            lines.append(f"Interesujace aktywa: {', '.join(assets)}")

        regions = _as_string_list(preference.interested_regions)
        if regions:
            lines.append(f"Interesujace regiony: {', '.join(regions)}")

        topics = _as_string_list(preference.interested_topics)
        if topics:
            lines.append(f"Interesujace tematy: {', '.join(topics)}")

        if preference.notes:
            lines.append(f"Dodatkowe notatki: {preference.notes}")

        return "\n".join(lines).strip()
