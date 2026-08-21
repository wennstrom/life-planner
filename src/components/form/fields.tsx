import { useId, type ComponentProps } from 'react'

import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { fromSelectValue, toSelectValue } from '~/lib/forms/select-none'
import { useFieldContext, useFormContext } from './form-contexts'

function fieldErrorItems(errors: Array<unknown>) {
  return errors.flatMap((error) => {
    if (typeof error === 'string') return [{ message: error }]
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return [{ message: error.message }]
    }
    return []
  })
}

type TextFieldProps = {
  label: string
  id?: string
  placeholder?: string
  type?: 'text' | 'date' | 'time' | 'number'
  autoFocus?: boolean
  min?: number
  step?: number
}

export function TextField({
  label,
  id,
  type = 'text',
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const field = useFieldContext<string | number>()
  const isInvalid = field.state.meta.errors.length > 0
  const value = field.state.value
  const stringValue =
    typeof value === 'number' && Number.isNaN(value) ? '' : String(value)

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      <Input
        {...inputProps}
        id={controlId}
        type={type}
        value={stringValue}
        aria-invalid={isInvalid || undefined}
        onBlur={field.handleBlur}
        onChange={(event) => {
          if (typeof field.state.value === 'number') {
            field.handleChange(event.target.valueAsNumber)
          } else {
            field.handleChange(event.target.value)
          }
        }}
      />
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type TextareaFieldProps = {
  label: string
  id?: string
  placeholder?: string
  rows?: number
}

export function TextareaField({ label, id, ...props }: TextareaFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.errors.length > 0

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      <Textarea
        {...props}
        id={controlId}
        value={field.state.value}
        aria-invalid={isInvalid || undefined}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type SelectOption = { value: string; label: string }

type SelectFieldProps = {
  label: string
  id?: string
  placeholder?: string
  disabled?: boolean
  options: Array<SelectOption>
}

export function SelectField({
  label,
  id,
  placeholder,
  disabled,
  options,
}: SelectFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.errors.length > 0

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      <Select
        value={toSelectValue(field.state.value)}
        disabled={disabled}
        onValueChange={(value) => field.handleChange(fromSelectValue(value))}
      >
        <SelectTrigger
          id={controlId}
          className="w-full"
          aria-invalid={isInvalid}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value === '' ? 'none' : option.value}
              value={toSelectValue(option.value)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type CheckboxFieldProps = {
  label: string
  disabled?: boolean
}

export function CheckboxField({ label, disabled }: CheckboxFieldProps) {
  const controlId = useId()
  const field = useFieldContext<boolean>()

  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Checkbox
        id={controlId}
        checked={field.state.value}
        disabled={disabled}
        onCheckedChange={(value) => field.handleChange(value === true)}
      />
      <FieldLabel htmlFor={controlId} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  )
}

export function SubmitButton({
  label,
  variant,
}: {
  label: string
  variant?: ComponentProps<typeof Button>['variant']
}) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" variant={variant} disabled={isSubmitting}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  )
}

function submitFormMessage(error: unknown): string | null {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'form' in error) {
    const formError = (error as { form?: unknown }).form
    return typeof formError === 'string' ? formError : null
  }
  return null
}

export function FormError() {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
      {(error) => {
        const message = submitFormMessage(error)
        return message ? (
          <p className="text-sm text-destructive">{message}</p>
        ) : null
      }}
    </form.Subscribe>
  )
}
