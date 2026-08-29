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
    PostgrestVersion: "14.17"
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
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
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
            foreignKeyName: "commitments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
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
          region?: string | null
          segment?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          created_at: string
          decided_by: string | null
          decision_date: string | null
          description: string | null
          id: string
          implementation_id: string
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
        ]
      }
      escalations: {
        Row: {
          description: string | null
          escalation_type: string | null
          id: string
          implementation_id: string
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
          stage: string
        }
        Insert: {
          entered_at: string
          entered_by?: string | null
          exited_at?: string | null
          id?: string
          implementation_id: string
          notes?: string | null
          stage: string
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          exited_at?: string | null
          id?: string
          implementation_id?: string
          notes?: string | null
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
        ]
      }
      milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          id: string
          implementation_id: string
          name: string
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
            foreignKeyName: "milestones_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
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
          reason?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requirement_id?: string
        }
        Relationships: [
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
          role: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          role: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
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
      trace_links: {
        Row: {
          created_at: string
          from_entity_id: string
          from_entity_type: string
          id: string
          relationship: string
          to_entity_id: string
          to_entity_type: string
        }
        Insert: {
          created_at?: string
          from_entity_id: string
          from_entity_type: string
          id?: string
          relationship: string
          to_entity_id: string
          to_entity_type: string
        }
        Update: {
          created_at?: string
          from_entity_id?: string
          from_entity_type?: string
          id?: string
          relationship?: string
          to_entity_id?: string
          to_entity_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
