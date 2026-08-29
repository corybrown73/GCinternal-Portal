export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adoption_areas: {
        Row: {
          created_at: string
          customer_owner_contact_id: string | null
          expected_frequency: string | null
          id: string
          implementation_id: string
          in_use_definition: string | null
          intended_usage: string | null
          intended_users: string | null
          kind: string
          name: string
          notes: string | null
          org_id: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_owner_contact_id?: string | null
          expected_frequency?: string | null
          id?: string
          implementation_id: string
          in_use_definition?: string | null
          intended_usage?: string | null
          intended_users?: string | null
          kind: string
          name: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_owner_contact_id?: string | null
          expected_frequency?: string | null
          id?: string
          implementation_id?: string
          in_use_definition?: string | null
          intended_usage?: string | null
          intended_users?: string | null
          kind?: string
          name?: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adoption_areas_customer_owner_contact_id_fkey"
            columns: ["customer_owner_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_areas_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_areas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_areas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      adoption_observations: {
        Row: {
          adoption_area_id: string
          created_at: string
          evidence_id: string | null
          id: string
          notes: string | null
          observed_at: string
          observed_by: string | null
          org_id: string
          source: string | null
          state: string
          workaround_description: string | null
          workaround_in_use: boolean
        }
        Insert: {
          adoption_area_id: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          observed_by?: string | null
          org_id?: string
          source?: string | null
          state: string
          workaround_description?: string | null
          workaround_in_use?: boolean
        }
        Update: {
          adoption_area_id?: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          observed_by?: string | null
          org_id?: string
          source?: string | null
          state?: string
          workaround_description?: string | null
          workaround_in_use?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "adoption_observations_adoption_area_id_fkey"
            columns: ["adoption_area_id"]
            isOneToOne: false
            referencedRelation: "adoption_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_observations_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_observations_observed_by_fkey"
            columns: ["observed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_observations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          customer_id: string | null
          detail: string | null
          id: string
          implementation_id: string | null
          kind: string
          notified_at: string | null
          org_id: string
          payload: Json | null
          severity: string
          source: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          customer_id?: string | null
          detail?: string | null
          id?: string
          implementation_id?: string | null
          kind: string
          notified_at?: string | null
          org_id?: string
          payload?: Json | null
          severity?: string
          source?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          customer_id?: string | null
          detail?: string | null
          id?: string
          implementation_id?: string | null
          kind?: string
          notified_at?: string | null
          org_id?: string
          payload?: Json | null
          severity?: string
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_entity_id: string | null
          approved_entity_type: string | null
          approver_name: string | null
          approver_role: string | null
          customer_contact_id: string | null
          decided_at: string | null
          evidence_id: string | null
          id: string
          implementation_id: string
          org_id: string
          requested_at: string
          status: string
          title: string
        }
        Insert: {
          approved_entity_id?: string | null
          approved_entity_type?: string | null
          approver_name?: string | null
          approver_role?: string | null
          customer_contact_id?: string | null
          decided_at?: string | null
          evidence_id?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          requested_at?: string
          status?: string
          title: string
        }
        Update: {
          approved_entity_id?: string | null
          approved_entity_type?: string | null
          approver_name?: string | null
          approver_role?: string | null
          customer_contact_id?: string | null
          decided_at?: string | null
          evidence_id?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          requested_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_type: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          org_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_type: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_type?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          committed_to: string | null
          description: string
          due_date: string | null
          fulfilled_at: string | null
          id: string
          implementation_id: string
          made_at: string
          made_by: string | null
          org_id: string
          owner_id: string | null
          status: string
        }
        Insert: {
          committed_to?: string | null
          description: string
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          implementation_id: string
          made_at?: string
          made_by?: string | null
          org_id?: string
          owner_id?: string | null
          status?: string
        }
        Update: {
          committed_to?: string | null
          description?: string
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          implementation_id?: string
          made_at?: string
          made_by?: string | null
          org_id?: string
          owner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_made_by_fkey"
            columns: ["made_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          kind: string
          org_id: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          org_id?: string
          title: string
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          org_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_handoffs: {
        Row: {
          account_context: string | null
          created_at: string
          cs_owner_id: string | null
          handoff_date: string | null
          id: string
          implementation_id: string
          open_items: string | null
          org_id: string
          summary: string | null
        }
        Insert: {
          account_context?: string | null
          created_at?: string
          cs_owner_id?: string | null
          handoff_date?: string | null
          id?: string
          implementation_id: string
          open_items?: string | null
          org_id?: string
          summary?: string | null
        }
        Update: {
          account_context?: string | null
          created_at?: string
          cs_owner_id?: string | null
          handoff_date?: string | null
          id?: string
          implementation_id?: string
          open_items?: string | null
          org_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_handoffs_cs_owner_id_fkey"
            columns: ["cs_owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_handoffs_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: true
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_handoffs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id?: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invites: {
        Row: {
          accepted_at: string | null
          contact_id: string | null
          created_at: string | null
          customer_id: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
        }
        Insert: {
          accepted_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          customer_id: string
          email: string
          id?: string
          invited_by?: string | null
          org_id?: string
        }
        Update: {
          accepted_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          customer_id?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_invites_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_users: {
        Row: {
          contact_id: string | null
          created_at: string | null
          customer_id: string
          id: string
          org_id: string
          profile_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          org_id?: string
          profile_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_users_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          arr: number | null
          created_at: string
          external_id: string | null
          id: string
          industry: string | null
          name: string
          org_id: string
          region: string | null
          segment: string | null
          source: string
          updated_at: string
        }
        Insert: {
          arr?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          industry?: string | null
          name: string
          org_id?: string
          region?: string | null
          segment?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          arr?: number | null
          created_at?: string
          external_id?: string | null
          id?: string
          industry?: string | null
          name?: string
          org_id?: string
          region?: string | null
          segment?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          decided_by: string | null
          decision_date: string | null
          description: string | null
          id: string
          implementation_id: string
          org_id: string
          rationale: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          rationale?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          rationale?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_events: {
        Row: {
          contact_email: string | null
          created_at: string | null
          enrollment_id: string | null
          event: string
          id: string
          org_id: string
          payload: Json | null
          step_id: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string | null
          enrollment_id?: string | null
          event: string
          id?: string
          org_id?: string
          payload?: Json | null
          step_id?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string | null
          enrollment_id?: string | null
          event?: string
          id?: string
          org_id?: string
          payload?: Json | null
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "journey_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          description: string | null
          escalation_type: string | null
          id: string
          implementation_id: string
          org_id: string
          owner_id: string | null
          raised_at: string
          raised_by: string | null
          related_issue_id: string | null
          related_risk_id: string | null
          resolution_summary: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          description?: string | null
          escalation_type?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          owner_id?: string | null
          raised_at?: string
          raised_by?: string | null
          related_issue_id?: string | null
          related_risk_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          description?: string | null
          escalation_type?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          owner_id?: string | null
          raised_at?: string
          raised_by?: string | null
          related_issue_id?: string | null
          related_risk_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_related_issue_id_fkey"
            columns: ["related_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_related_risk_id_fkey"
            columns: ["related_risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          created_at: string
          description: string | null
          id: string
          implementation_id: string
          org_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mappings: {
        Row: {
          created_at: string
          id: string
          implementation_id: string
          org_id: string
          required: boolean | null
          source_field: string | null
          source_system: string | null
          status: string | null
          target_field: string | null
          technical_solution_id: string | null
          transformation_notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          implementation_id: string
          org_id?: string
          required?: boolean | null
          source_field?: string | null
          source_system?: string | null
          status?: string | null
          target_field?: string | null
          technical_solution_id?: string | null
          transformation_notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          implementation_id?: string
          org_id?: string
          required?: boolean | null
          source_field?: string | null
          source_system?: string | null
          status?: string | null
          target_field?: string | null
          technical_solution_id?: string | null
          transformation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_technical_solution_id_fkey"
            columns: ["technical_solution_id"]
            isOneToOne: false
            referencedRelation: "technical_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      graduations: {
        Row: {
          created_at: string
          cs_owner_id: string | null
          exit_criteria_summary: string | null
          graduated_at: string | null
          health_at_graduation: string | null
          id: string
          implementation_id: string
          notes: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          cs_owner_id?: string | null
          exit_criteria_summary?: string | null
          graduated_at?: string | null
          health_at_graduation?: string | null
          id?: string
          implementation_id: string
          notes?: string | null
          org_id?: string
        }
        Update: {
          created_at?: string
          cs_owner_id?: string | null
          exit_criteria_summary?: string | null
          graduated_at?: string | null
          health_at_graduation?: string | null
          id?: string
          implementation_id?: string
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduations_cs_owner_id_fkey"
            columns: ["cs_owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduations_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: true
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_stage_history: {
        Row: {
          entered_at: string
          entered_by: string | null
          exited_at: string | null
          id: string
          implementation_id: string
          notes: string | null
          org_id: string
          stage: string
        }
        Insert: {
          entered_at: string
          entered_by?: string | null
          exited_at?: string | null
          id?: string
          implementation_id: string
          notes?: string | null
          org_id?: string
          stage: string
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          exited_at?: string | null
          id?: string
          implementation_id?: string
          notes?: string | null
          org_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_stage_history_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_stage_history_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_stage_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      implementations: {
        Row: {
          actual_launch_date: string | null
          contract_start_date: string | null
          created_at: string
          current_stage: string
          customer_goals: string | null
          customer_id: string
          discovery_board_image_name: string | null
          discovery_board_image_url: string | null
          discovery_board_notes: string | null
          discovery_board_url: string | null
          external_ref: string | null
          id: string
          name: string
          org_id: string
          owner_id: string | null
          sales_owner: string | null
          source: string
          sow_document_name: string | null
          sow_document_url: string | null
          sow_reference: string | null
          sow_signed_date: string | null
          sow_value: number | null
          stage_entered_at: string
          status: string
          target_launch_date: string | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          actual_launch_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          current_stage: string
          customer_goals?: string | null
          customer_id: string
          discovery_board_image_name?: string | null
          discovery_board_image_url?: string | null
          discovery_board_notes?: string | null
          discovery_board_url?: string | null
          external_ref?: string | null
          id?: string
          name: string
          org_id?: string
          owner_id?: string | null
          sales_owner?: string | null
          source?: string
          sow_document_name?: string | null
          sow_document_url?: string | null
          sow_reference?: string | null
          sow_signed_date?: string | null
          sow_value?: number | null
          stage_entered_at?: string
          status?: string
          target_launch_date?: string | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          actual_launch_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          current_stage?: string
          customer_goals?: string | null
          customer_id?: string
          discovery_board_image_name?: string | null
          discovery_board_image_url?: string | null
          discovery_board_notes?: string | null
          discovery_board_url?: string | null
          external_ref?: string | null
          id?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          sales_owner?: string | null
          source?: string
          sow_document_name?: string | null
          sow_document_url?: string | null
          sow_reference?: string | null
          sow_signed_date?: string | null
          sow_value?: number | null
          stage_entered_at?: string
          status?: string
          target_launch_date?: string | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          description: string | null
          id: string
          implementation_id: string
          org_id: string
          owner_id: string | null
          raised_at: string
          resolution: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          owner_id?: string | null
          raised_at?: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          owner_id?: string | null
          raised_at?: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          author_id: string | null
          created_at: string
          id: string
          implementation_id: string
          links: string | null
          note: string
          org_id: string
          stage: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          implementation_id: string
          links?: string | null
          note: string
          org_id?: string
          stage: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          implementation_id?: string
          links?: string | null
          note?: string
          org_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_enrollments: {
        Row: {
          contact_email: string
          contact_id: string | null
          created_at: string | null
          current_step: number
          customer_id: string
          id: string
          journey_id: string
          last_sent_at: string | null
          org_id: string
          status: string
        }
        Insert: {
          contact_email: string
          contact_id?: string | null
          created_at?: string | null
          current_step?: number
          customer_id: string
          id?: string
          journey_id: string
          last_sent_at?: string | null
          org_id?: string
          status?: string
        }
        Update: {
          contact_email?: string
          contact_id?: string | null
          created_at?: string | null
          current_step?: number
          customer_id?: string
          id?: string
          journey_id?: string
          last_sent_at?: string | null
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_steps: {
        Row: {
          advance_on: string
          content_item_id: string | null
          delay_hours: number | null
          email_body: string
          email_subject: string
          id: string
          journey_id: string
          org_id: string
          step_order: number
          title: string
        }
        Insert: {
          advance_on?: string
          content_item_id?: string | null
          delay_hours?: number | null
          email_body: string
          email_subject: string
          id?: string
          journey_id: string
          org_id?: string
          step_order: number
          title: string
        }
        Update: {
          advance_on?: string
          content_item_id?: string | null
          delay_hours?: number | null
          email_body?: string
          email_subject?: string
          id?: string
          journey_id?: string
          org_id?: string
          step_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_steps_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_steps_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          trigger_event: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          trigger_event?: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "journeys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          id: string
          implementation_id: string
          name: string
          org_id: string
          owner_id: string | null
          stage: string | null
          status: string
          target_date: string | null
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          id?: string
          implementation_id: string
          name: string
          org_id?: string
          owner_id?: string | null
          stage?: string | null
          status?: string
          target_date?: string | null
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          id?: string
          implementation_id?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          stage?: string | null
          status?: string
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      portal_accounts: {
        Row: {
          am_owner_id: string | null
          arr: number | null
          created_at: string
          customer_id: string | null
          domain: string | null
          id: string
          name: string
          products: string[]
          salesforce_id: string | null
          se_owner_id: string | null
          stage: Database["public"]["Enums"]["portal_account_stage"]
          stage_entered_at: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          am_owner_id?: string | null
          arr?: number | null
          created_at?: string
          customer_id?: string | null
          domain?: string | null
          id?: string
          name: string
          products?: string[]
          salesforce_id?: string | null
          se_owner_id?: string | null
          stage?: Database["public"]["Enums"]["portal_account_stage"]
          stage_entered_at?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          am_owner_id?: string | null
          arr?: number | null
          created_at?: string
          customer_id?: string | null
          domain?: string | null
          id?: string
          name?: string
          products?: string[]
          salesforce_id?: string | null
          se_owner_id?: string | null
          stage?: Database["public"]["Enums"]["portal_account_stage"]
          stage_entered_at?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_accounts_am_owner_id_fkey"
            columns: ["am_owner_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_accounts_se_owner_id_fkey"
            columns: ["se_owner_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "portal_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      portal_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      portal_briefs: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          error: string | null
          generator:
            | Database["public"]["Enums"]["portal_brief_generator"]
            | null
          id: string
          pptx_storage_path: string | null
          source_report_ids: string[]
          status: Database["public"]["Enums"]["portal_brief_status"]
          structured_json: Json | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          generator?:
            | Database["public"]["Enums"]["portal_brief_generator"]
            | null
          id?: string
          pptx_storage_path?: string | null
          source_report_ids?: string[]
          status?: Database["public"]["Enums"]["portal_brief_status"]
          structured_json?: Json | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          generator?:
            | Database["public"]["Enums"]["portal_brief_generator"]
            | null
          id?: string
          pptx_storage_path?: string | null
          source_report_ids?: string[]
          status?: Database["public"]["Enums"]["portal_brief_status"]
          structured_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_briefs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_gong_reports: {
        Row: {
          account_id: string
          content_md: string
          created_at: string
          id: string
          report_type: Database["public"]["Enums"]["portal_gong_report_type"]
          title: string
          uploaded_by: string | null
        }
        Insert: {
          account_id: string
          content_md: string
          created_at?: string
          id?: string
          report_type?: Database["public"]["Enums"]["portal_gong_report_type"]
          title: string
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string
          content_md?: string
          created_at?: string
          id?: string
          report_type?: Database["public"]["Enums"]["portal_gong_report_type"]
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_gong_reports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_gong_reports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_onboarding_notes: {
        Row: {
          account_id: string
          author_id: string | null
          body_md: string
          created_at: string
          id: string
          review_status: Database["public"]["Enums"]["portal_note_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          account_id: string
          author_id?: string | null
          body_md: string
          created_at?: string
          id?: string
          review_status?: Database["public"]["Enums"]["portal_note_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          account_id?: string
          author_id?: string | null
          body_md?: string
          created_at?: string
          id?: string
          review_status?: Database["public"]["Enums"]["portal_note_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_onboarding_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_onboarding_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_onboarding_notes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["portal_user_role"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["portal_user_role"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["portal_user_role"]
        }
        Relationships: []
      }
      portal_stage_transitions: {
        Row: {
          account_id: string
          actor_api_key_id: string | null
          actor_profile_id: string | null
          from_stage: Database["public"]["Enums"]["portal_account_stage"] | null
          id: string
          note: string | null
          occurred_at: string
          source: Database["public"]["Enums"]["portal_transition_source"]
          to_stage: Database["public"]["Enums"]["portal_account_stage"]
        }
        Insert: {
          account_id: string
          actor_api_key_id?: string | null
          actor_profile_id?: string | null
          from_stage?:
            | Database["public"]["Enums"]["portal_account_stage"]
            | null
          id?: string
          note?: string | null
          occurred_at?: string
          source: Database["public"]["Enums"]["portal_transition_source"]
          to_stage: Database["public"]["Enums"]["portal_account_stage"]
        }
        Update: {
          account_id?: string
          actor_api_key_id?: string | null
          actor_profile_id?: string | null
          from_stage?:
            | Database["public"]["Enums"]["portal_account_stage"]
            | null
          id?: string
          note?: string | null
          occurred_at?: string
          source?: Database["public"]["Enums"]["portal_transition_source"]
          to_stage?: Database["public"]["Enums"]["portal_account_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "portal_stage_transitions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_stage_transitions_actor_api_key_id_fkey"
            columns: ["actor_api_key_id"]
            isOneToOne: false
            referencedRelation: "portal_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_stage_transitions_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tam_requests: {
        Row: {
          account_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_via: string | null
          decision_note: string | null
          id: string
          justification: string
          requested_by: string | null
          requester_email: string
          status: Database["public"]["Enums"]["portal_tam_status"]
          token_jti: string
          urgency: string
        }
        Insert: {
          account_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          decision_note?: string | null
          id?: string
          justification: string
          requested_by?: string | null
          requester_email: string
          status?: Database["public"]["Enums"]["portal_tam_status"]
          token_jti?: string
          urgency?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          decision_note?: string | null
          id?: string
          justification?: string
          requested_by?: string | null
          requester_email?: string
          status?: Database["public"]["Enums"]["portal_tam_status"]
          token_jti?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_tam_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tam_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tam_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_scope_changes: {
        Row: {
          change_type: string
          created_at: string
          decision: string | null
          decision_at: string | null
          decision_by: string | null
          description: string | null
          effective_date: string | null
          id: string
          impact: string | null
          org_id: string
          reason: string | null
          requested_at: string | null
          requested_by: string | null
          requirement_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          decision?: string | null
          decision_at?: string | null
          decision_by?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string
          impact?: string | null
          org_id?: string
          reason?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requirement_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          decision?: string | null
          decision_at?: string | null
          decision_by?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string
          impact?: string | null
          org_id?: string
          reason?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requirement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_scope_changes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_scope_changes_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          implementation_id: string
          org_id: string
          priority: string
          scope_status: string
          source: string | null
          status: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          priority?: string
          scope_status?: string
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          priority?: string
          scope_status?: string
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          description: string | null
          id: string
          identified_at: string
          impact: string | null
          implementation_id: string
          likelihood: string
          mitigation: string | null
          org_id: string
          owner_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          identified_at?: string
          impact?: string | null
          implementation_id: string
          likelihood?: string
          mitigation?: string | null
          org_id?: string
          owner_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          identified_at?: string
          impact?: string | null
          implementation_id?: string
          likelihood?: string
          mitigation?: string | null
          org_id?: string
          owner_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      success_criteria: {
        Row: {
          baseline_period: string | null
          baseline_value: string | null
          created_at: string
          customer_owner_contact_id: string | null
          description: string
          due_stage: string | null
          id: string
          implementation_id: string
          measured_at: string | null
          measured_value: string | null
          measurement_source: string | null
          metric: string | null
          org_id: string
          owner_id: string | null
          status: string
          target_date: string | null
          target_value: string | null
        }
        Insert: {
          baseline_period?: string | null
          baseline_value?: string | null
          created_at?: string
          customer_owner_contact_id?: string | null
          description: string
          due_stage?: string | null
          id?: string
          implementation_id: string
          measured_at?: string | null
          measured_value?: string | null
          measurement_source?: string | null
          metric?: string | null
          org_id?: string
          owner_id?: string | null
          status?: string
          target_date?: string | null
          target_value?: string | null
        }
        Update: {
          baseline_period?: string | null
          baseline_value?: string | null
          created_at?: string
          customer_owner_contact_id?: string | null
          description?: string
          due_stage?: string | null
          id?: string
          implementation_id?: string
          measured_at?: string | null
          measured_value?: string | null
          measurement_source?: string | null
          metric?: string | null
          org_id?: string
          owner_id?: string | null
          status?: string
          target_date?: string | null
          target_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "success_criteria_customer_owner_contact_id_fkey"
            columns: ["customer_owner_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      success_criteria_observations: {
        Row: {
          assessment: string | null
          created_at: string
          evidence_id: string | null
          id: string
          notes: string | null
          observed_at: string
          observed_by: string | null
          observed_value: string
          org_id: string
          source: string | null
          success_criteria_id: string
        }
        Insert: {
          assessment?: string | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          observed_by?: string | null
          observed_value: string
          org_id?: string
          source?: string | null
          success_criteria_id: string
        }
        Update: {
          assessment?: string | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          observed_by?: string | null
          observed_value?: string
          org_id?: string
          source?: string | null
          success_criteria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "success_criteria_observations_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_observations_observed_by_fkey"
            columns: ["observed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_observations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "success_criteria_observations_success_criteria_id_fkey"
            columns: ["success_criteria_id"]
            isOneToOne: false
            referencedRelation: "success_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string
          role: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id?: string
          role: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_solution_notes: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          links: string | null
          note_type: string
          org_id: string
          technical_solution_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: string | null
          note_type: string
          org_id?: string
          technical_solution_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: string | null
          note_type?: string
          org_id?: string
          technical_solution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_solution_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_solution_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_solution_notes_technical_solution_id_fkey"
            columns: ["technical_solution_id"]
            isOneToOne: false
            referencedRelation: "technical_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_solutions: {
        Row: {
          configuration_details: string | null
          created_at: string
          design_summary: string | null
          id: string
          implementation_id: string
          org_id: string
          owner_id: string | null
          requirement_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          configuration_details?: string | null
          created_at?: string
          design_summary?: string | null
          id?: string
          implementation_id: string
          org_id?: string
          owner_id?: string | null
          requirement_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          configuration_details?: string | null
          created_at?: string
          design_summary?: string | null
          id?: string
          implementation_id?: string
          org_id?: string
          owner_id?: string | null
          requirement_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_solutions_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_solutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_solutions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_solutions_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          created_at: string | null
          id: string
          internal: boolean
          org_id: string
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          internal?: boolean
          org_id?: string
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          internal?: boolean
          org_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_routing: {
        Row: {
          category: string
          created_at: string | null
          fallback_profile_id: string | null
          id: string
          org_id: string
          route_role: string
        }
        Insert: {
          category: string
          created_at?: string | null
          fallback_profile_id?: string | null
          id?: string
          org_id?: string
          route_role: string
        }
        Update: {
          category?: string
          created_at?: string | null
          fallback_profile_id?: string | null
          id?: string
          org_id?: string
          route_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_routing_fallback_profile_id_fkey"
            columns: ["fallback_profile_id"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_routing_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_role: string | null
          assigned_to: string | null
          body: string
          category: string
          created_at: string | null
          customer_id: string | null
          first_response_at: string | null
          id: string
          implementation_id: string | null
          org_id: string
          priority: string
          resolved_at: string | null
          sla_breached: boolean
          sla_due_at: string
          sla_warned_at: string | null
          status: string
          subject: string
          submitted_by: string | null
          submitter_email: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_role?: string | null
          assigned_to?: string | null
          body: string
          category: string
          created_at?: string | null
          customer_id?: string | null
          first_response_at?: string | null
          id?: string
          implementation_id?: string | null
          org_id?: string
          priority?: string
          resolved_at?: string | null
          sla_breached?: boolean
          sla_due_at: string
          sla_warned_at?: string | null
          status?: string
          subject: string
          submitted_by?: string | null
          submitter_email?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_role?: string | null
          assigned_to?: string | null
          body?: string
          category?: string
          created_at?: string | null
          customer_id?: string | null
          first_response_at?: string | null
          id?: string
          implementation_id?: string | null
          org_id?: string
          priority?: string
          resolved_at?: string | null
          sla_breached?: boolean
          sla_due_at?: string
          sla_warned_at?: string | null
          status?: string
          subject?: string
          submitted_by?: string | null
          submitter_email?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "portal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trace_links: {
        Row: {
          created_at: string
          from_entity_id: string
          from_entity_type: string
          id: string
          org_id: string
          relationship: string
          to_entity_id: string
          to_entity_type: string
        }
        Insert: {
          created_at?: string
          from_entity_id: string
          from_entity_type: string
          id?: string
          org_id?: string
          relationship: string
          to_entity_id: string
          to_entity_type: string
        }
        Update: {
          created_at?: string
          from_entity_id?: string
          from_entity_type?: string
          id?: string
          org_id?: string
          relationship?: string
          to_entity_id?: string
          to_entity_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "trace_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      portal_can_manage: { Args: never; Returns: boolean }
      portal_is_admin: { Args: never; Returns: boolean }
      portal_is_internal: { Args: never; Returns: boolean }
      portal_is_super_admin: { Args: never; Returns: boolean }
      portal_role: {
        Args: never
        Returns: Database["public"]["Enums"]["portal_user_role"]
      }
      portal_transition_stage: {
        Args: {
          p_account_id: string
          p_actor_api_key?: string
          p_actor_profile?: string
          p_note?: string
          p_occurred_at?: string
          p_source?: Database["public"]["Enums"]["portal_transition_source"]
          p_to_stage: Database["public"]["Enums"]["portal_account_stage"]
        }
        Returns: {
          account_id: string
          actor_api_key_id: string | null
          actor_profile_id: string | null
          from_stage: Database["public"]["Enums"]["portal_account_stage"] | null
          id: string
          note: string | null
          occurred_at: string
          source: Database["public"]["Enums"]["portal_transition_source"]
          to_stage: Database["public"]["Enums"]["portal_account_stage"]
        }
        SetofOptions: {
          from: "*"
          to: "portal_stage_transitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      portal_account_stage:
        | "prospect"
        | "closed_won"
        | "onboarding_kickoff"
        | "in_onboarding"
        | "onboarding_complete"
      portal_brief_generator: "llm" | "template"
      portal_brief_status: "queued" | "generating" | "complete" | "failed"
      portal_gong_report_type: "call_notes" | "account_map"
      portal_note_review_status: "needs_review" | "reviewed"
      portal_tam_status: "pending" | "approved" | "declined" | "expired"
      portal_transition_source: "ui" | "api" | "csv_import" | "system"
      portal_user_role:
        | "admin"
        | "am"
        | "se"
        | "onboarding"
        | "super_admin"
        | "sales"
        | "implementation"
        | "tam_se"
        | "manager"
        | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      portal_account_stage: [
        "prospect",
        "closed_won",
        "onboarding_kickoff",
        "in_onboarding",
        "onboarding_complete",
      ],
      portal_brief_generator: ["llm", "template"],
      portal_brief_status: ["queued", "generating", "complete", "failed"],
      portal_gong_report_type: ["call_notes", "account_map"],
      portal_note_review_status: ["needs_review", "reviewed"],
      portal_tam_status: ["pending", "approved", "declined", "expired"],
      portal_transition_source: ["ui", "api", "csv_import", "system"],
      portal_user_role: [
        "admin",
        "am",
        "se",
        "onboarding",
        "super_admin",
        "sales",
        "implementation",
        "tam_se",
        "manager",
        "customer",
      ],
    },
  },
} as const
