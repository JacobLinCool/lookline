-- An edition session is opened against a collection; a personal card session has no collection.
-- Settling reads the collection from here rather than from the request, so a session cannot be
-- redirected at a group its issuer never took part in.
ALTER TABLE `card_sessions` ADD `collection_id` text REFERENCES collections(id);
