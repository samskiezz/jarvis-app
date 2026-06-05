CREATE CONSTRAINT subject_id IF NOT EXISTS FOR (s:DomainSubject) REQUIRE s.subject_id IS UNIQUE;
CREATE CONSTRAINT acquisition_point_id IF NOT EXISTS FOR (a:AcquisitionPoint) REQUIRE a.acquisition_point_id IS UNIQUE;
// Load CSV rows and MERGE nodes/edges using source_id, subject_id, acquisition_point_id.
