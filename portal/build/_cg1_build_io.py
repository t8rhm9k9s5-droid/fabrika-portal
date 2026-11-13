"""Small file readers for build scripts; preserves open() defaults."""
import json


def read_file(*args, **kwargs):
    with open(*args, **kwargs) as handle:
        return handle.read()


def read_json(*args, **kwargs):
    with open(*args, **kwargs) as handle:
        return json.load(handle)
