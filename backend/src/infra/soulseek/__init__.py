"""Automatic Soulseek downloads for library tracks.

Everything that talks to the network goes through :class:`SoulseekTransport`
(see ``transport.py``), so the search/match/download pipeline in ``jobs.py``
can be tested with a fake and the underlying library swapped.
"""
