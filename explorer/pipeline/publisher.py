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
        staged_rows = list(staged_qs)
        staged_ids = [s.id for s in staged_rows]

        # Supersede existing active rows in bulk
        conflicts = Observation.objects.filter(
            region__in=[s.region_id for s in staged_rows],
            period__in=[s.period_id for s in staged_rows],
            indicator__in=[s.indicator_id for s in staged_rows],
            metric__in=[s.metric_id for s in staged_rows],
            status="PUBLISHED",
            superseded_at__isnull=True,
        ).exclude(id__in=staged_ids)

        superseded_count = conflicts.update(status="SUPERSEDED", superseded_at=now)

        # Publish staged rows in bulk
        published_count = staged_qs.update(status="PUBLISHED", published_at=now)

        # Check and compute active DerivedIndicators (e.g. Per Capita)
        active_derived = DerivedIndicator.objects.filter(status="ACTIVE").select_related("indicator", "output_unit")
        for deriv in active_derived:
            if deriv.evaluator_key == "PER_CAPITA":
                tax_input = deriv.inputs.filter(role="TAX").first()
                pop_input = deriv.inputs.filter(role="POPULATION").first()
                if tax_input and pop_input:
                    # Check if staged row has tax
                    if staged_rows and staged_rows[0].indicator == tax_input.input_indicator and staged_rows[0].metric == tax_input.input_metric:
                        pop_map = {
                            (p.region_id, p.period_id): p
                            for p in Observation.objects.filter(
                                indicator=pop_input.input_indicator,
                                metric=pop_input.input_metric,
                                status="PUBLISHED",
                                superseded_at__isnull=True,
                                region_id__in=[s.region_id for s in staged_rows],
                                period_id__in=[s.period_id for s in staged_rows],
                            )
                        }
                        # Bulk supersede any existing active derived observations for these region/periods
                        Observation.objects.filter(
                            indicator=deriv.indicator,
                            metric=staged_rows[0].metric,
                            status="PUBLISHED",
                            superseded_at__isnull=True,
                            region_id__in=[s.region_id for s in staged_rows],
                            period_id__in=[s.period_id for s in staged_rows],
                        ).update(status="SUPERSEDED", superseded_at=now)

                        for staged in staged_rows:
                            pop_obs = pop_map.get((staged.region_id, staged.period_id))
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
                    # Case 2: staged row is population
                    elif staged_rows and staged_rows[0].indicator_id == pop_input.input_indicator_id and staged_rows[0].metric_id == pop_input.input_metric_id:
                            # Pre-index existing published tax observations for these periods/regions
                            tax_map = {
                                (t.region_id, t.period_id): t
                                for t in Observation.objects.filter(
                                    indicator=tax_input.input_indicator,
                                    metric=tax_input.input_metric,
                                    status="PUBLISHED",
                                    superseded_at__isnull=True,
                                    region_id__in=[s.region_id for s in staged_rows],
                                    period_id__in=[s.period_id for s in staged_rows],
                                )
                            }
                            for staged in staged_rows:
                                tax_obs = tax_map.get((staged.region_id, staged.period_id))
                                if tax_obs and tax_obs.numeric_value and staged.numeric_value:
                                    per_cap_val = calculate_per_capita(tax_obs.numeric_value, staged.numeric_value)
                                    if per_cap_val is not None:
                                        derived_obs = Observation.objects.create(
                                            region=staged.region,
                                            period=staged.period,
                                            indicator=deriv.indicator,
                                            metric=tax_obs.metric,
                                            tax_owner=tax_obs.tax_owner,
                                            numeric_value=per_cap_val,
                                            canonical_unit=deriv.output_unit,
                                            raw_value=str(per_cap_val),
                                            status="PUBLISHED",
                                            derived_indicator=deriv,
                                            published_at=now,
                                        )
                                        ObservationInput.objects.create(
                                            derived_observation=derived_obs,
                                            input_observation=tax_obs,
                                            input_role="TAX",
                                        )
                                        ObservationInput.objects.create(
                                            derived_observation=derived_obs,
                                            input_observation=staged,
                                            input_role="POPULATION",
                                        )
                                        derived_count += 1
                            break

        job.status = "SUCCESS"
        job.finished_at = now
        job.save(update_fields=["status", "finished_at"])

    return PublishResult(
        success=True,
        published_count=published_count,
        superseded_count=superseded_count,
        derived_count=derived_count,
    )
