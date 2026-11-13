"""Small file readers; preserve the caller's open arguments and defaults."""
import json


def read_file(*args, **kwargs):
    with open(*args, **kwargs) as stream:
        return stream.read()


def load_json(*args, **kwargs):
    with open(*args, **kwargs) as stream:
        return json.load(stream)
