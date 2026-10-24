import runpy
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build-wordlist"
BUILDER = runpy.run_path(str(SCRIPT))


class WordlistBuilderTests(unittest.TestCase):
    def test_filters_non_lowercase_non_ascii_and_out_of_range_words(self):
        for word in ("Amsterdam", "café", "woord-beeld", "2de", "te lang", "a", "abcdefghijk"):
            with self.subTest(word=word):
                self.assertIsNone(BUILDER["normalize_source_word"](word))

    def test_ij_is_one_internal_tile(self):
        self.assertEqual(BUILDER["normalize_source_word"]("ijs"), "ĲS")
        self.assertEqual(len(BUILDER["normalize_source_word"]("bij")), 2)
        self.assertEqual(len(BUILDER["normalize_source_word"]("abcdefghij")), 9)
        self.assertEqual(BUILDER["normalize_source_word"]("wijnhandel"), "WĲNHANDEL")

    def test_alphagram_sorts_tiles_including_ij_as_one(self):
        self.assertEqual(BUILDER["alphagram"]("ĲSA"), "ASĲ")

    def test_required_hunspell_forms_are_in_generated_final_wordlist(self):
        words_file = Path(__file__).resolve().parents[1] / "data" / "words.txt"
        words = set(words_file.read_text(encoding="utf-8").splitlines())
        expected = {"HUIZEN", "LIEP", "GELOPEN", "LOOPT", "MOOISTE", "WĲNHANDEL"}
        self.assertEqual(expected - words, set())


if __name__ == "__main__":
    unittest.main()
