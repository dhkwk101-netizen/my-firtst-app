from dataclasses import dataclass
from django.db import transaction
from django.utils import timezone
from explorer.models import (
    DerivedIndicator,
    DerivedIndicatorInput,
    IngestionJob,
    Observation,
    ObservationInput,
)
from explorer.pipeline.derived import calculate_per_capita


@dataclass
class PublishResult:
    success: bool
    published_count: int = 0
    superseded_count: int = 0
    derived_count: int = 0
    error_message: str | None = None


def publish_job(job_id: int) -> PublishResult:
    job = IngestionJob.objects.get(id=job_id)

    # Check if any staged row failed quality
    has_failed_dq = Observation.objects.filter(
        ingestion_job=job, status="UNPUBLISHED", quality_status="FAILED"
    ).exists()
    if has_failed_dq:
        return PublishResult(
            success=False,
            error_message="Staged observations contain failed data quality rows",
        )

    staged_qs = Observation.objects.filter(ingestion_job=job, status="UNPUBLISHED")
    if not staged_qs.exists():
        return PublishResult(success=True, published_count=0)

    now = timezone.now()
    published_count = 0
    superseded_count = 0
    derived_count = 0

    with transaction.atomic():
        staged_rows = list(staged_qs.select_for_update())

        for staged in staged_rows:
            # Supersede existing active rows for this identity
            conflicts = Observation.objects.select_for_update().filter(
                region=staged.region,
                period=staged.period,
                indicator=staged.indicator,
                metric=staged.metric,
                tax_owner=staged.tax_owner,
                status="PUBLISHED",
                superseded_at__isnull=True,
            ).exclude(id=staged.id)

            for old_row in conflicts:
                old_row.status = "SUPERSEDED"
                old_row.superseded_at = now
                old_row.save(update_fields=["status", "superseded_at"])
                superseded_count += 1

            staged.status = "PUBLISHED"
            staged.published_at = now
            staged.save(update_fields=["status", "published_at"])
            published_count += 1

        # Check and compute active DerivedIndicators (e.g. Per Capita)
        active_derived = DerivedIndicator.objects.filter(status="ACTIVE").select_related("indicator", "output_unit")
        for deriv in active_derived:
            if deriv.evaluator_key == "PER_CAPITA":
                # Find input requirements
                tax_input = deriv.inputs.filter(role="TAX").first()
                pop_input = deriv.inputs.filter(role="POPULATION").first()
                if tax_input and pop_input:
                    # For newly published rows matching tax input, look for corresponding population
                    for staged in staged_rows:
                        if staged.indicator == tax_input.input_indicator and staged.metric == tax_input.input_metric:
                            pop_obs = Observation.objects.filter(
                                region=staged.region,
                                period=staged.period,
                                indicator=pop_input.input_indicator,
                                metric=pop_input.input_metric,
                                status="PUBLISHED",
                                superseded_at__isnull=True,
                            ).first()
                            if pop_obs and pop_obs.numeric_value:
                                per_cap_val = calculate_per_capita(staged.numeric_value, pop_obs.numeric_value)
                                if per_cap_val is not None:
                                    derived_obs = Observation.objects.create(
                                        region=staged.region,
                                        period=staged.period,
                                        indicator=deriv.indicator,
                                        metric=staged.metric,
                                        tax_owner=staged.tax_owner,
                                        numeric_value=per_cap_val,
                                        canonical_unit=deriv.output_unit,
                                        raw_value=str(per_cap_val),
                                        status="PUBLISHED",
                                        derived_indicator=deriv,
                                        published_at=now,
                                    )
                                    ObservationInput.objects.create(
                                        derived_observation=derived_obs,
                                        input_observation=staged,
                                        input_role="TAX",
                                    )
                                    ObservationInput.objects.create(
                                        derived_observation=derived_obs,
                                        input_observation=pop_obs,
                                        input_role="POPULATION",
                                    )
                                    derived_count += 1

        job.status = "SUCCESS"
        job.finished_at = now
        job.save(update_fields=["status", "finished_at"])

    return PublishResult(
        success=True,
        published_count=published_count,
        superseded_count=superseded_count,
        derived_count=derived_count,
    )
