from datetime import datetime, date
from typing import Tuple
from .models import AgentSettings, BudgetLimits, SpentTracking


class CostGuard:
    """
    Budget enforcement and cost tracking for agent operations.

    Ensures users don't exceed their configured spending limits.
    Tracks daily and monthly spending with automatic reset logic.
    """

    def __init__(self):
        pass

    async def check_budget_available(self, user_settings: AgentSettings, estimated_cost: float) -> Tuple[bool, str]:
        """
        Check if user has budget for operation.

        Args:
            user_settings: User's agent settings with budget limits and tracking
            estimated_cost: Estimated cost of the operation in USD

        Returns:
            Tuple of (allowed: bool, reason: str)
            - If allowed=True, operation can proceed
            - If allowed=False, reason contains the budget limit message
        """
        spent = user_settings.spent_tracking
        limits = user_settings.budget_limits

        # Reset daily if new day
        if spent.last_reset_daily.date() < date.today():
            spent.daily_spent = 0.0
            spent.last_reset_daily = datetime.utcnow()

        # Reset monthly if new month
        today = date.today()
        if spent.last_reset_monthly.month != today.month or spent.last_reset_monthly.year != today.year:
            spent.monthly_spent = 0.0
            spent.last_reset_monthly = datetime.utcnow()

        # Check limits
        if spent.daily_spent + estimated_cost > limits.daily_usd:
            return False, f"Daily budget exceeded (${spent.daily_spent:.2f} / ${limits.daily_usd:.2f})"

        if spent.monthly_spent + estimated_cost > limits.monthly_usd:
            return False, f"Monthly budget exceeded (${spent.monthly_spent:.2f} / ${limits.monthly_usd:.2f})"

        if estimated_cost > limits.per_session_usd:
            return False, f"Per-session budget exceeded (${estimated_cost:.2f} / ${limits.per_session_usd:.2f})"

        return True, ""

    async def record_spend(self, user_settings: AgentSettings, actual_cost: float):
        """
        Record actual spending after operation completes.

        Args:
            user_settings: User's agent settings to update
            actual_cost: Actual cost incurred in USD
        """
        user_settings.spent_tracking.daily_spent += actual_cost
        user_settings.spent_tracking.monthly_spent += actual_cost

    def get_budget_status(self, user_settings: AgentSettings) -> dict:
        """
        Get current budget status.

        Args:
            user_settings: User's agent settings

        Returns:
            Dictionary with budget status information
        """
        spent = user_settings.spent_tracking
        limits = user_settings.budget_limits

        return {
            "daily_limit": limits.daily_usd,
            "daily_spent": spent.daily_spent,
            "daily_remaining": limits.daily_usd - spent.daily_spent,
            "monthly_limit": limits.monthly_usd,
            "monthly_spent": spent.monthly_spent,
            "monthly_remaining": limits.monthly_usd - spent.monthly_spent,
            "per_session_limit": limits.per_session_usd
        }

    def should_warn(self, user_settings: AgentSettings) -> Tuple[bool, str]:
        """
        Check if user should be warned about budget usage.

        Args:
            user_settings: User's agent settings

        Returns:
            Tuple of (should_warn: bool, message: str)
        """
        spent = user_settings.spent_tracking
        limits = user_settings.budget_limits
        alerts = user_settings.alerts

        warn_threshold = alerts.warn_at_percentage / 100.0

        # Check daily budget
        if spent.daily_spent >= limits.daily_usd * warn_threshold:
            return True, f"Daily budget at {(spent.daily_spent / limits.daily_usd * 100):.0f}%"

        # Check monthly budget
        if spent.monthly_spent >= limits.monthly_usd * warn_threshold:
            return True, f"Monthly budget at {(spent.monthly_spent / limits.monthly_usd * 100):.0f}%"

        return False, ""
