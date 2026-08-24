import { createFormHook } from '@tanstack/react-form'
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from './fields'
import { fieldContext, formContext } from './form-contexts'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    SelectField,
    CheckboxField,
  },
  formComponents: {
    SubmitButton,
    FormError,
  },
})
