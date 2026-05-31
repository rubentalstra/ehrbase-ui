// PatientForm — create/edit a demographic patient (CLINICAL-UI.md §4
// admin/patients; ADR-0031 Demographic IM: PERSON + PARTY_IDENTITY + ADDRESS +
// CONTACT). react-hook-form + zodResolver; field arrays for names / identifiers
// / addresses / contacts. Identifier checksums reuse the demographic-core
// registry validators (same code the adapter enforces). Maps the form shape to
// the canonical CreatePartyInput on submit. All copy via Paraglide; shadcn only.

import { zodResolver } from '@hookform/resolvers/zod'
import {
  validateIdentifier,
  type CreatePartyInput,
  type Party,
} from '@ehrbase-ui/demographic-core'
import { m } from '@ehrbase-ui/i18n/messages'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { IdentifierField } from './identifier-field.tsx'
import { IDENTIFIER_NAMESPACE_KEYS } from './identifier-namespaces.ts'

const NAME_USES = ['official', 'usual', 'maiden', 'nickname'] as const
const GENDERS = ['male', 'female', 'other', 'unknown'] as const
const CONTACT_SYSTEMS = ['phone', 'email', 'fax', 'url', 'sms', 'other'] as const

const NAME_USE_LABEL: Record<(typeof NAME_USES)[number], () => string> = {
  official: m.admin_patients_name_use_official,
  usual: m.admin_patients_name_use_usual,
  maiden: m.admin_patients_name_use_maiden,
  nickname: m.admin_patients_name_use_nickname,
}
const GENDER_LABEL: Record<(typeof GENDERS)[number], () => string> = {
  male: m.admin_patients_gender_male,
  female: m.admin_patients_gender_female,
  other: m.admin_patients_gender_other,
  unknown: m.admin_patients_gender_unknown,
}
const CONTACT_LABEL: Record<(typeof CONTACT_SYSTEMS)[number], () => string> = {
  phone: m.admin_patients_contact_phone,
  email: m.admin_patients_contact_email,
  fax: m.admin_patients_contact_fax,
  url: m.admin_patients_contact_url,
  sms: m.admin_patients_contact_sms,
  other: m.admin_patients_contact_other,
}

const FormValuesSchema = z
  .object({
    names: z
      .array(
        z.object({
          use: z.enum(NAME_USES),
          family: z.string().trim(),
          given: z.string().trim(),
        }),
      )
      .min(1),
    identifiers: z
      .array(z.object({ namespace: z.string().min(1), value: z.string().trim().min(1) }))
      .min(1),
    gender: z.enum(GENDERS).optional(),
    birthDate: z.string().trim(),
    addresses: z.array(
      z.object({
        line: z.string().trim(),
        city: z.string().trim(),
        postalCode: z.string().trim(),
        country: z.string().trim(),
      }),
    ),
    contacts: z.array(
      z.object({ system: z.enum(CONTACT_SYSTEMS), value: z.string().trim().min(1) }),
    ),
  })
  .superRefine((v, ctx) => {
    v.names.forEach((n, i) => {
      if (!n.family && !n.given) {
        ctx.addIssue({ code: 'custom', path: ['names', i, 'family'], message: 'required' })
      }
    })
    v.identifiers.forEach((id, i) => {
      if (id.value && !validateIdentifier(id.namespace, id.value).valid) {
        ctx.addIssue({ code: 'custom', path: ['identifiers', i, 'value'], message: 'invalid' })
      }
    })
  })

type FormValues = z.infer<typeof FormValuesSchema>

const FIRST_NS = IDENTIFIER_NAMESPACE_KEYS[0] ?? 'mrn'

function emptyForm(): FormValues {
  return {
    names: [{ use: 'official', family: '', given: '' }],
    identifiers: [{ namespace: FIRST_NS, value: '' }],
    birthDate: '',
    addresses: [],
    contacts: [],
  }
}

function toFormValues(p: Party): FormValues {
  return {
    names: p.names.length
      ? p.names.map((n) => ({
          use: n.use ?? 'official',
          family: n.family ?? '',
          given: (n.given ?? []).join(', '),
        }))
      : [{ use: 'official', family: '', given: '' }],
    identifiers: p.identifiers.length
      ? p.identifiers.map((id) => ({ namespace: id.namespace, value: id.value }))
      : [{ namespace: FIRST_NS, value: '' }],
    ...(p.gender ? { gender: p.gender } : {}),
    birthDate: p.birthDate ?? '',
    addresses: p.addresses.map((a) => ({
      line: (a.lines ?? []).join(', '),
      city: a.city ?? '',
      postalCode: a.postalCode ?? '',
      country: a.country ?? '',
    })),
    contacts: p.contacts.map((c) => ({ system: c.system, value: c.value })),
  }
}

function toCreateInput(v: FormValues): CreatePartyInput {
  return {
    names: v.names.map((n) => ({
      use: n.use,
      ...(n.family ? { family: n.family } : {}),
      given: n.given
        ? n.given
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      prefix: [],
      suffix: [],
    })),
    identifiers: v.identifiers.map((id) => ({ namespace: id.namespace, value: id.value.trim() })),
    ...(v.gender ? { gender: v.gender } : {}),
    ...(v.birthDate ? { birthDate: v.birthDate } : {}),
    addresses: v.addresses
      .filter((a) => a.line || a.city || a.postalCode || a.country)
      .map((a) => ({
        lines: a.line ? [a.line] : [],
        ...(a.city ? { city: a.city } : {}),
        ...(a.postalCode ? { postalCode: a.postalCode } : {}),
        ...(a.country ? { country: a.country } : {}),
      })),
    contacts: v.contacts.map((c) => ({ system: c.system, value: c.value.trim() })),
  }
}

export interface PatientFormProps {
  /** Pre-fill for edit; omit for create. */
  patient?: Party
  onSubmit: (input: CreatePartyInput) => void
  pending: boolean
}

export function PatientForm({ patient, onSubmit, pending }: PatientFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormValuesSchema),
    defaultValues: patient ? toFormValues(patient) : emptyForm(),
    mode: 'onBlur',
  })
  const { control, register, handleSubmit, formState } = form
  const names = useFieldArray({ control, name: 'names' })
  const identifiers = useFieldArray({ control, name: 'identifiers' })
  const addresses = useFieldArray({ control, name: 'addresses' })
  const contacts = useFieldArray({ control, name: 'contacts' })

  return (
    <form
      onSubmit={handleSubmit((v) => onSubmit(toCreateInput(v)))}
      noValidate
      className="space-y-6"
    >
      {/* Names */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{m.admin_patients_form_names()}</legend>
        {names.fields.map((field, i) => (
          <div key={field.id} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`name-${i}-use`}>{m.admin_patients_form_name_use()}</Label>
              <Controller
                control={control}
                name={`names.${i}.use`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger id={`name-${i}-use`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NAME_USES.map((u) => (
                        <SelectItem key={u} value={u}>
                          {NAME_USE_LABEL[u]()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`name-${i}-family`}>{m.admin_patients_form_family()}</Label>
              <Input id={`name-${i}-family`} {...register(`names.${i}.family`)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`name-${i}-given`}>{m.admin_patients_form_given()}</Label>
              <div className="flex gap-2">
                <Input id={`name-${i}-given`} {...register(`names.${i}.given`)} />
                {names.fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => names.remove(i)}
                    aria-label={m.admin_patients_form_name_remove()}
                  >
                    ✕
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => names.append({ use: 'official', family: '', given: '' })}
        >
          {m.admin_patients_form_name_add()}
        </Button>
      </fieldset>

      <Separator />

      {/* Identifiers */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{m.admin_patients_form_identifiers()}</legend>
        {identifiers.fields.map((field, i) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1">
              <Controller
                control={control}
                name={`identifiers.${i}.namespace`}
                render={({ field: nsField }) => (
                  <Controller
                    control={control}
                    name={`identifiers.${i}.value`}
                    render={({ field: valField }) => (
                      <IdentifierField
                        idPrefix={`identifier-${i}`}
                        namespace={nsField.value}
                        value={valField.value}
                        onNamespaceChange={nsField.onChange}
                        onValueChange={valField.onChange}
                      />
                    )}
                  />
                )}
              />
            </div>
            {identifiers.fields.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => identifiers.remove(i)}
                aria-label={m.admin_patients_form_identifier_remove()}
              >
                ✕
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => identifiers.append({ namespace: FIRST_NS, value: '' })}
        >
          {m.admin_patients_form_identifier_add()}
        </Button>
      </fieldset>

      <Separator />

      {/* Demographics */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="patient-gender">{m.admin_patients_form_gender()}</Label>
          <Controller
            control={control}
            name="gender"
            render={({ field: f }) => (
              <Select value={f.value ?? ''} onValueChange={f.onChange}>
                <SelectTrigger id="patient-gender">
                  <SelectValue placeholder={m.admin_patients_search_any()} />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GENDER_LABEL[g]()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="patient-birthdate">{m.admin_patients_form_birthdate()}</Label>
          <Input id="patient-birthdate" type="date" {...register('birthDate')} />
        </div>
      </div>

      <Separator />

      {/* Addresses */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{m.admin_patients_form_addresses()}</legend>
        {addresses.fields.map((field, i) => (
          <div key={field.id} className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`addr-${i}-line`}>{m.admin_patients_form_address_line()}</Label>
              <Input id={`addr-${i}-line`} {...register(`addresses.${i}.line`)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`addr-${i}-city`}>{m.admin_patients_form_city()}</Label>
              <Input id={`addr-${i}-city`} {...register(`addresses.${i}.city`)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`addr-${i}-postal`}>{m.admin_patients_form_postal()}</Label>
              <Input id={`addr-${i}-postal`} {...register(`addresses.${i}.postalCode`)} />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`addr-${i}-country`}>{m.admin_patients_form_country()}</Label>
              <Input id={`addr-${i}-country`} maxLength={2} {...register(`addresses.${i}.country`)} />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addresses.remove(i)}
                aria-label={m.admin_patients_form_address_remove()}
              >
                ✕
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            addresses.append({ line: '', city: '', postalCode: '', country: '' })
          }
        >
          {m.admin_patients_form_address_add()}
        </Button>
      </fieldset>

      <Separator />

      {/* Contacts */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{m.admin_patients_form_contacts()}</legend>
        {contacts.fields.map((field, i) => (
          <div key={field.id} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`contact-${i}-system`}>
                {m.admin_patients_form_contact_system()}
              </Label>
              <Controller
                control={control}
                name={`contacts.${i}.system`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger id={`contact-${i}-system`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_SYSTEMS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {CONTACT_LABEL[s]()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`contact-${i}-value`}>
                {m.admin_patients_form_contact_value()}
              </Label>
              <div className="flex gap-2">
                <Input id={`contact-${i}-value`} {...register(`contacts.${i}.value`)} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => contacts.remove(i)}
                  aria-label={m.admin_patients_form_contact_remove()}
                >
                  ✕
                </Button>
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => contacts.append({ system: 'phone', value: '' })}
        >
          {m.admin_patients_form_contact_add()}
        </Button>
      </fieldset>

      {formState.errors.names || formState.errors.identifiers ? (
        <p className="text-destructive text-sm" role="alert">
          {m.admin_patients_form_required()}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {m.admin_patients_form_save()}
      </Button>
    </form>
  )
}
